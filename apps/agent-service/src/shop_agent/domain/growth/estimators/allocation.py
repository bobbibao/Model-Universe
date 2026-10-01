"""Splitting an ad budget across platforms: in proportion to expected ROAS, with an exploration floor.

TikTok gets nothing without a staff-uploaded video (it has no image ads).
"""

from __future__ import annotations

from collections.abc import Sequence

from shop_agent.domain.growth.defaults import Priors

ROUND_VND = 1_000


def allocate(
    budget_vnd: int, platforms: Sequence[str], priors: Priors, *, has_video: bool, floor: float = 0.2
) -> dict[str, int]:
    """Whole-VND shares (rounded down to 1,000) that never add up to more than the budget."""
    eligible = [p for p in platforms if p != "tiktok" or has_video]
    if not eligible or budget_vnd <= 0:
        return {}
    roas = {p: max(priors.get(f"ads.{p}").mean, 0.0) for p in eligible}
    total = sum(roas.values()) or 1.0
    floor = min(floor, 1 / len(eligible))
    raw = {p: floor + (1 - floor * len(eligible)) * roas[p] / total for p in eligible}
    return {p: int(budget_vnd * share) // ROUND_VND * ROUND_VND for p, share in raw.items()}
