"""Where month-to-date revenue stands against the monthly target (docs/GROWTH_AGENT.md section 2, `revenue_gap`).

The expected revenue by today is the target spread over the month's days by weekday: each weekday weighs its average
share of revenue over the last WEIGHT_WEEKS complete weeks (a Saturday usually sells more than a Tuesday). Without
enough history every day weighs the same.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, timedelta

from shop_agent.domain.growth.snapshot import GrowthSnapshot

WEIGHT_WEEKS = 8
MIN_WEIGHT_DAYS = 28  # below this, equal weights


@dataclass(frozen=True)
class GoalPacing:
    month_start: date
    today: date
    target_vnd: int | None
    target_source: str
    month_to_date_vnd: int
    expected_to_date_vnd: int | None
    gap_pct: float | None  # (actual - expected) / expected; negative = behind

    @property
    def behind(self) -> bool:
        return self.gap_pct is not None and self.gap_pct < 0


def weekday_weights(snapshot: GrowthSnapshot) -> list[float]:
    """Relative revenue per weekday (Monday = 0), from the last complete weeks before today."""
    last = snapshot.today - timedelta(days=1)
    first = last - timedelta(days=7 * WEIGHT_WEEKS - 1)
    days = snapshot.sales_between(first, last)
    totals = [0.0] * 7
    for day in days:
        totals[day.day.weekday()] += day.revenue_vnd
    if len(days) < MIN_WEIGHT_DAYS or sum(totals) <= 0:
        return [1.0] * 7
    mean = sum(totals) / 7
    return [max(total / mean, 0.1) for total in totals]


def goal_pacing(snapshot: GrowthSnapshot) -> GoalPacing:
    today = snapshot.today
    month_start = today.replace(day=1)
    month_to_date = sum(day.revenue_vnd for day in snapshot.sales_between(month_start, today))
    targets = snapshot.targets
    target = targets.revenue_target_vnd if targets else None
    source = targets.revenue_target_source if targets else "none"
    if not target:
        return GoalPacing(month_start, today, None, source, month_to_date, None, None)
    weights = weekday_weights(snapshot)
    days_in_month = calendar.monthrange(today.year, today.month)[1]
    month_days = [month_start + timedelta(days=offset) for offset in range(days_in_month)]
    total = sum(weights[day.weekday()] for day in month_days)
    elapsed = sum(weights[day.weekday()] for day in month_days if day <= today)
    expected = round(target * elapsed / total)
    gap = (month_to_date - expected) / expected if expected else None
    return GoalPacing(month_start, today, target, source, month_to_date, expected, gap)
