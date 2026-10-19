"""Owner-template checks for Facebook drafts, independent of model wording or publish tools."""

from __future__ import annotations

import json
import re

from shop_agent.domain.growth.brand import claims


def post_template_problems(text: str, facts: str, locale: str = "vi") -> list[str]:
    problems: list[str] = []
    lower = text.casefold()
    if "model universe" not in lower and "vũ trụ mô hình" not in lower:
        problems.append("missing brand signature")
    if "📍" not in text or "gò vấp" not in lower:
        problems.append("missing location footer")
    if "🚚" not in text or "cod" not in lower:
        problems.append("missing shipping footer")
    if not ("inbox" in lower and any(icon in text for icon in ("📩", "💬"))):
        problems.append("missing inbox CTA")
    services = ("trade", "thu mua", "cầm", "lắp") if locale == "vi" else ("trade", "buyback", "pawn", "assembl")
    if not all(service in lower for service in services):
        problems.append("missing service line")
    if locale == "vi" and re.search(r"\b(quý khách|bạn)\b", lower):
        problems.append("use shop/mình and anh em/ae instead of formal or generic address")
    try:
        raw = json.loads(facts)
    except (ValueError, TypeError):
        return problems
    if not isinstance(raw, dict):
        return problems
    products = raw.get("products", [raw] if "name" in raw else [])
    if not isinstance(products, list):
        return problems
    for product in products:
        if not isinstance(product, dict):
            continue
        name, sku = product.get("name"), product.get("sku")
        identities = [value for value in (name, sku) if isinstance(value, str) and value]
        position = next((lower.find(value.casefold()) for value in identities if value.casefold() in lower), -1)
        if identities and position < 0:
            problems.append(f"missing selected product: {identities[0]}")
        for defect in product.get("defects") or []:
            if isinstance(defect, str) and defect.casefold() not in lower:
                problems.append(f"missing disclosed defect: {defect}")
        if position >= 0:
            preceding = text[:position]
            following = text[position:].splitlines()[:3]
            context = "\n".join(following)
            condition = product.get("condition")
            expected = {"new": "new", "preowned": "2nd"}.get(condition) if isinstance(condition, str) else None
            headings = re.findall(r"(?im)^.*(?:hàng|【)\s*(NEW|2ND).*$", preceding)
            if (
                expected
                and expected not in context.casefold()
                and (not headings or headings[-1].casefold() != expected)
            ):
                problems.append(f"missing {expected.upper()} condition: {name or sku}")
            price = product.get("price")
            verified = claims(
                f"{price} VND" if isinstance(price, (int, float)) and not isinstance(price, bool) else str(price)
            )
            if verified and not any(
                claim.kind == "vnd" and claim.value == verified[0].value for claim in claims(context)
            ):
                problems.append(f"missing verified price: {name or sku}")
    return problems
