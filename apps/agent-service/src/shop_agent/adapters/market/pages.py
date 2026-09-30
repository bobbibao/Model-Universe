"""Reading a competitor's product page: price and title from the HTML (selectolax), per data/market/selectors.yaml.

Only these parsed fields leave this module: the price as whole VND and the title cut to 200 characters. The title is
competitor text: stored and shown as data, never followed.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict, Field
from selectolax.lexbor import LexborHTMLParser

SELECTORS_FILE = Path(__file__).resolve().parents[4] / "data" / "market" / "selectors.yaml"
MAX_TITLE = 200
MIN_PRICE_VND = 1_000
MAX_PRICE_VND = 1_000_000_000  # the web's limit (MarketService)
SITE_CONFIDENCE = 1.0  # a price read with the site's own selectors
DEFAULT_CONFIDENCE = 0.8  # a price read from generic markup


class Selector(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    css: str
    attr: str | None = None


class SiteSelectors(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    price: tuple[Selector, ...] = ()
    title: tuple[Selector, ...] = ()


class SelectorConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    default: SiteSelectors = SiteSelectors()
    sites: dict[str, SiteSelectors] = Field(default_factory=dict)

    def for_host(self, host: str) -> SiteSelectors | None:
        return self.sites.get(host.removeprefix("www."))


def load_selectors(path: Path = SELECTORS_FILE) -> SelectorConfig:
    """Reads a file: call it outside the event loop."""
    return SelectorConfig.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")) or {})


def parse_price_vnd(text: str) -> int | None:
    """'199.000đ', '199.000 ₫', '1,299,000', '199000.00', '199000' -> whole VND; None when out of range."""
    cleaned = re.sub(r"[^\d.,]", "", text)
    cleaned = re.sub(r"[.,]\d{1,2}$", "", cleaned)  # a decimal fraction: VND has no minor unit
    digits = re.sub(r"\D", "", cleaned)
    if not digits:
        return None
    amount = int(digits)
    return amount if MIN_PRICE_VND <= amount <= MAX_PRICE_VND else None


def clean_title(text: str | None) -> str | None:
    cleaned = " ".join((text or "").split())[:MAX_TITLE]
    return cleaned or None


@dataclass(frozen=True)
class ProductPage:
    price_vnd: int | None
    title: str | None
    confidence: float


def _values(tree: LexborHTMLParser, selectors: Sequence[Selector]) -> Iterator[str]:
    for selector in selectors:
        for node in tree.css(selector.css):
            value = node.attributes.get(selector.attr) if selector.attr else node.text(strip=True)
            if value:
                yield value


def _json_ld_products(tree: LexborHTMLParser) -> Iterator[Mapping[str, Any]]:
    for node in tree.css('script[type="application/ld+json"]'):
        try:
            data = json.loads(node.text())
        except ValueError:
            continue
        items = data if isinstance(data, list) else [data]
        items += [entry for item in items if isinstance(item, dict) for entry in item.get("@graph", [])]
        for item in items:
            if isinstance(item, dict) and item.get("@type") in ("Product", ["Product"]):
                yield item


def _json_ld_price(product: Mapping[str, Any]) -> str | None:
    offers = product.get("offers")
    for offer in offers if isinstance(offers, list) else [offers]:
        if isinstance(offer, dict):
            price = offer.get("price") or offer.get("lowPrice")
            if price is not None:
                return str(price)
    return None


def read_product_page(html: str, host: str, config: SelectorConfig) -> ProductPage:
    tree = LexborHTMLParser(html)
    site = config.for_host(host)
    price: int | None = None
    confidence = DEFAULT_CONFIDENCE
    if site is not None:
        price = next(filter(None, map(parse_price_vnd, _values(tree, site.price))), None)
        confidence = SITE_CONFIDENCE
    if price is None:
        confidence = DEFAULT_CONFIDENCE
        price = next(filter(None, map(parse_price_vnd, _values(tree, config.default.price))), None)
    products = list(_json_ld_products(tree))
    if price is None:
        price = next(filter(None, (parse_price_vnd(p) for p in map(_json_ld_price, products) if p)), None)
    title_selectors = (*(site.title if site else ()), *config.default.title)
    title = next(_values(tree, title_selectors), None) or next(
        (str(p["name"]) for p in products if p.get("name")), None
    )
    return ProductPage(price, clean_title(title), confidence)
