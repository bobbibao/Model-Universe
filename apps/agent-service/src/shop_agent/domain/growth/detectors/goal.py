"""`revenue_gap`: month-to-date revenue at least `revenue_gap_pct` behind the weekday-weighted pace of the target."""

from __future__ import annotations

from shop_agent.domain.growth.defaults import GrowthDefaults
from shop_agent.domain.growth.detectors.base import month_bucket
from shop_agent.domain.growth.pacing import goal_pacing
from shop_agent.domain.growth.snapshot import GrowthSnapshot
from shop_agent.domain.models import Opportunity, Severity, make_fingerprint
from shop_agent.domain.money import format_vnd


class RevenueGapDetector:
    kind = "revenue_gap"

    def detect(self, snapshot: GrowthSnapshot, defaults: GrowthDefaults) -> list[Opportunity]:
        if snapshot.today.day < defaults.detectors.revenue_gap_min_days:
            return []
        pacing = goal_pacing(snapshot)
        if pacing.gap_pct is None or pacing.expected_to_date_vnd is None or pacing.target_vnd is None:
            return []
        behind = -pacing.gap_pct * 100
        if behind < defaults.detectors.revenue_gap_pct:
            return []
        severity = Severity.HIGH if behind >= 25 else Severity.MEDIUM if behind >= 15 else Severity.LOW
        shortfall = pacing.expected_to_date_vnd - pacing.month_to_date_vnd
        return [
            Opportunity(
                kind=self.kind,
                fingerprint=make_fingerprint(self.kind, ["shop"], month_bucket(snapshot.today)),
                severity=severity,
                title=f"Doanh thu tháng chậm {behind:.0f}% so với kế hoạch",
                summary=(
                    f"Đến nay đạt {format_vnd(pacing.month_to_date_vnd)}, "
                    f"kế hoạch {format_vnd(pacing.expected_to_date_vnd)} "
                    f"(thiếu {format_vnd(shortfall)}); mục tiêu tháng {format_vnd(pacing.target_vnd)}."
                ),
                evidence={
                    "month_to_date_vnd": pacing.month_to_date_vnd,
                    "expected_to_date_vnd": pacing.expected_to_date_vnd,
                    "target_vnd": pacing.target_vnd,
                    "gap_pct": round(pacing.gap_pct * 100, 1),
                    "shortfall_vnd": shortfall,
                },
                detected_at=snapshot.taken_at,
            )
        ]
