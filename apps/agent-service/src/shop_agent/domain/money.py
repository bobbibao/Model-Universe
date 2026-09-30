"""Money is whole VND everywhere (ADR-0009 D6). This module only formats it for people; it never computes."""

from __future__ import annotations


def format_vnd(amount: int | float) -> str:
    """`1072300` -> `1.072.300 ₫` (Vietnamese grouping, no decimals)."""
    rounded = round(amount)
    sign = "-" if rounded < 0 else ""
    return f"{sign}{abs(rounded):,} ₫".replace(",", ".")
