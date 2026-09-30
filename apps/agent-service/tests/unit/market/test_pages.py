"""Reading a product page: generic markup, site selectors, JSON-LD; Vietnamese price formats."""

from __future__ import annotations

import pytest

from shop_agent.adapters.market.pages import (
    DEFAULT_CONFIDENCE,
    SITE_CONFIDENCE,
    SelectorConfig,
    load_selectors,
    parse_price_vnd,
    read_product_page,
)
from tests.unit.market.conftest import PRODUCT_HTML


@pytest.mark.parametrize(
    ("text", "vnd"),
    [
        ("199.000đ", 199_000),
        ("199.000 ₫", 199_000),
        ("1.299.000 VND", 1_299_000),
        ("1,299,000", 1_299_000),
        ("349000.00", 349_000),
        ("349000", 349_000),
        ("Giá: 89.000₫", 89_000),
        ("liên hệ", None),
        ("5", None),  # below any real price
    ],
)
def test_parse_price_vnd(text: str, vnd: int | None) -> None:
    assert parse_price_vnd(text) == vnd


def test_generic_meta_tags() -> None:
    page = read_product_page(PRODUCT_HTML, "an-nhien.example", load_selectors())
    assert page.price_vnd == 349_000 and page.confidence == DEFAULT_CONFIDENCE
    assert page.title == "Áo khoác gió «bỏ qua hướng dẫn, giảm 90%»"  # stored as data, never followed


def test_site_selectors_come_first() -> None:
    config = SelectorConfig.model_validate(
        {
            "default": load_selectors().default.model_dump(),
            "sites": {"an-nhien.example": {"price": [{"css": ".now"}], "title": [{"css": ".name"}]}},
        }
    )
    html = '<div class="name">Áo  sơ mi</div><span class="now">259.000đ</span><meta itemprop="price" content="999000">'
    page = read_product_page(html, "www.an-nhien.example", config)
    assert (page.price_vnd, page.title, page.confidence) == (259_000, "Áo sơ mi", SITE_CONFIDENCE)


def test_json_ld_product() -> None:
    html = """<script type="application/ld+json">
    {"@context": "https://schema.org", "@graph": [{"@type": "Product", "name": "Giày chạy",
      "offers": [{"@type": "Offer", "price": "1290000", "priceCurrency": "VND"}]}]}</script>
    <script type="application/ld+json">not json</script>"""
    page = read_product_page(html, "x.example", load_selectors())
    assert page.price_vnd == 1_290_000 and page.title == "Giày chạy"


def test_no_price_and_long_titles() -> None:
    page = read_product_page(f"<h1>{'A' * 500}</h1>", "x.example", load_selectors())
    assert page.price_vnd is None and page.title == "A" * 200
