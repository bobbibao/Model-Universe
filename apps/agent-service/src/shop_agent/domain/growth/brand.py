"""Brand safety lint (docs/GROWTH_AGENT.md section 4): deterministic checks on every text the agent would publish.

- banned terms, competitor names (Vietnam's advertising law), unproven superlatives;
- claim consistency: every percent and VND amount in the copy equals a value of the action bodies
  ("20%", "giảm 20 phần trăm", "199.000đ", "199.000 ₫", "199k", "1,2 triệu", "1.5tr");
- link domain; per-platform length; hashtag and emoji limits; Vietnamese text.
The brand judge (an LLM, `agents/brand_judge.py`) runs only on copy that passes this lint.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, ConfigDict

MAX_LENGTH = {
    "post": 5000,
    "headline": 40,
    "primary_text": 2000,
    "google_headline": 30,
    "google_description": 90,
    "ad_text": 100,
    "coupon_title": 255,
}
TextKind = Literal[
    "post", "headline", "primary_text", "google_headline", "google_description", "ad_text", "coupon_title"
]

_PERCENT = re.compile(r"(\d+(?:[.,]\d+)?)\s*(?:%|phần trăm)", re.IGNORECASE)
_MONEY = re.compile(
    r"(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(đồng|đ|₫|vnđ|vnd|k|nghìn|ngàn|triệu|tr)(?![a-zà-ỹ])", re.IGNORECASE
)
_MULTIPLIER = {"k": 1_000, "nghìn": 1_000, "ngàn": 1_000, "triệu": 1_000_000, "tr": 1_000_000}
_URL = re.compile(r"https?://([^/\s]+)", re.IGNORECASE)
_HASHTAG = re.compile(r"#\w+")
_VIETNAMESE = re.compile(r"[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]", re.IGNORECASE)


class BrandPolicy(BaseModel):
    """`data/knowledge/brand/brand_policy.yaml` (the owner reviews it with the brand guide)."""

    model_config = ConfigDict(extra="ignore", frozen=True)

    status: str = "draft"
    language: str = "vi"
    banned_terms: tuple[str, ...] = ()
    competitor_names: tuple[str, ...] = ()
    superlatives: tuple[str, ...] = ()
    max_hashtags: int = 5
    max_emoji: int = 3


@dataclass(frozen=True)
class Claim:
    kind: Literal["percent", "vnd"]
    value: float
    text: str


def _number(raw: str) -> float:
    if re.fullmatch(r"\d{1,3}(?:[.,]\d{3})+", raw):
        return float(re.sub(r"[.,]", "", raw))  # thousands separators: 199.000, 1,250,000
    return float(raw.replace(",", "."))  # a decimal: 1,2 or 1.5


def claims(text: str) -> list[Claim]:
    """The percentages and VND amounts a text states."""
    found = [Claim("percent", _number(m.group(1)), m.group(0)) for m in _PERCENT.finditer(text)]
    for m in _MONEY.finditer(text):
        unit = m.group(2).lower()
        found.append(Claim("vnd", _number(m.group(1)) * _MULTIPLIER.get(unit, 1), m.group(0)))
    return found


def _emoji_count(text: str) -> int:
    return sum(1 for ch in text if unicodedata.category(ch) == "So")


def _contains(text: str, term: str) -> bool:
    return re.search(rf"(?<!\w){re.escape(term.lower())}(?!\w)", text.lower()) is not None


def lint_copy(
    text: str,
    kind: TextKind,
    policy: BrandPolicy,
    *,
    percents: Iterable[float] = (),
    amounts_vnd: Iterable[int] = (),
    competitors: Sequence[str] = (),
    shop_domain: str | None = None,
) -> list[str]:
    """The problems of one text (empty when it passes)."""
    problems: list[str] = []
    if len(text) > MAX_LENGTH[kind]:
        problems.append(f"{kind} is longer than {MAX_LENGTH[kind]} characters")
    for term in policy.banned_terms:
        if _contains(text, term):
            problems.append(f"uses a banned term: {term}")
    for name in {*policy.competitor_names, *competitors}:
        if name and _contains(text, name):
            problems.append(f"names a competitor: {name}")
    for word in policy.superlatives:
        if _contains(text, word):
            problems.append(f"unproven superlative: {word}")
    allowed_percents, allowed_amounts = list(percents), list(amounts_vnd)
    for claim in claims(text):
        allowed = allowed_percents if claim.kind == "percent" else allowed_amounts
        if not any(abs(claim.value - value) < 0.5 for value in allowed):
            problems.append(f"states {claim.text!r}, which is not a value of the actions")
    for domain in _URL.findall(text):
        if shop_domain is None or domain.lower().removeprefix("www.") != shop_domain.lower().removeprefix("www."):
            problems.append(f"links outside the shop: {domain}")
    if len(_HASHTAG.findall(text)) > policy.max_hashtags:
        problems.append(f"more than {policy.max_hashtags} hashtags")
    if _emoji_count(text) > policy.max_emoji:
        problems.append(f"more than {policy.max_emoji} emoji")
    if policy.language == "vi" and len(text.split()) >= 4 and not _VIETNAMESE.search(text):
        problems.append("not written in Vietnamese")
    return problems
