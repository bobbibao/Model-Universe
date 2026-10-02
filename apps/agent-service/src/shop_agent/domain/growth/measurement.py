"""Measuring a growth action against what would have happened without it (docs/GROWTH_AGENT.md section 6).

- With scope SKUs and at least `min_controls` control SKUs (same category, price within `price_band`, not promoted):
  difference-in-differences on units. The counterfactual is the treated SKUs' pre-period units scaled by the
  controls' change; incremental revenue and gross profit are actual minus counterfactual (profit at each SKU's cost,
  so a discount's lost margin counts), net of ad spend.
- Otherwise: the shop's daily revenue against its same-weekday mean of the pre-period (lower confidence).
Deterministic: the same snapshot gives the same answer.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

from shop_agent.domain.growth.defaults import MeasurementDefaults
from shop_agent.domain.growth.demand import gross_margin_ratio
from shop_agent.domain.growth.snapshot import CatalogItem, GrowthSnapshot
from shop_agent.domain.money import format_vnd

Verdict = Literal["positive", "negative", "inconclusive"]
MAX_CONTROLS = 10


@dataclass(frozen=True)
class GrowthMeasurement:
    method: Literal["did", "baseline"]
    days: int
    incremental_revenue_vnd: int
    incremental_profit_vnd: int  # net of the discount's lost margin and of ad spend
    spend_vnd: int
    roas: float | None  # platform-attributed conversion value / spend
    mer: float | None  # incremental revenue / spend
    cpa_vnd: int | None
    controls: tuple[str, ...]
    confidence: float
    verdict: Verdict

    @property
    def summary(self) -> str:
        parts = [
            f"Doanh thu tăng thêm {format_vnd(self.incremental_revenue_vnd)}",
            f"lợi nhuận gộp tăng thêm {format_vnd(self.incremental_profit_vnd)}",
        ]
        if self.spend_vnd:
            parts.append(f"chi quảng cáo {format_vnd(self.spend_vnd)}")
        if self.roas is not None:
            parts.append(f"ROAS {self.roas:.1f}")
        method = "so với nhóm đối chứng" if self.method == "did" else "so với cùng thứ các tuần trước"
        return f"{'; '.join(parts)} trong {self.days} ngày ({method}, độ tin cậy {self.confidence:.0%})."


def _sku_totals(snapshot: GrowthSnapshot, skus: set[str], first: date, last: date) -> tuple[int, int]:
    rows = [r for r in snapshot.sku_sales_daily if r.sku in skus and first <= r.day <= last]
    return sum(r.units for r in rows), sum(r.revenue_vnd for r in rows)


def _promoted(snapshot: GrowthSnapshot, sku: str, first: date, last: date) -> bool:
    return any(
        p.sku == sku and p.kind == "discount" and p.starts_at.date() <= last and p.ends_at.date() >= first
        for p in snapshot.promotions
    )


def controls_for(
    snapshot: GrowthSnapshot, treated: Sequence[CatalogItem], first: date, last: date, defaults: MeasurementDefaults
) -> list[CatalogItem]:
    if not treated:
        return []
    skus = {i.sku for i in treated}
    categories = {i.category for i in treated}
    mean_price = sum(i.price_vnd for i in treated) / len(treated)
    low, high = mean_price * (1 - defaults.price_band), mean_price * (1 + defaults.price_band)
    pre_first = first - timedelta(days=defaults.pre_days)
    candidates = [
        i
        for i in snapshot.catalog
        if i.sku not in skus
        and i.category in categories
        and low <= i.price_vnd <= high
        and not _promoted(snapshot, i.sku, pre_first, last)
        and _sku_totals(snapshot, {i.sku}, pre_first, first - timedelta(days=1))[0] > 0
    ]
    candidates.sort(key=lambda i: (abs(i.price_vnd - mean_price), i.sku))
    return candidates[:MAX_CONTROLS]


def _verdict(profit: int, confidence: float, defaults: MeasurementDefaults) -> Verdict:
    if confidence < defaults.min_confidence or profit == 0:
        return "inconclusive"
    return "positive" if profit > 0 else "negative"


def measure_growth(
    snapshot: GrowthSnapshot,
    *,
    skus: Sequence[str],
    first: date,
    last: date,
    defaults: MeasurementDefaults,
    spend_vnd: int = 0,
    conversions: int = 0,
    conversion_value_vnd: int = 0,
) -> GrowthMeasurement:
    """The effect over the complete days `first`..`last` (the action started on `first`)."""
    days = max((last - first).days + 1, 1)
    pre_first, pre_last = first - timedelta(days=defaults.pre_days), first - timedelta(days=1)
    roas = conversion_value_vnd / spend_vnd if spend_vnd else None
    cpa = round(spend_vnd / conversions) if spend_vnd and conversions else None
    treated = [i for sku in skus if (i := snapshot.item(sku)) is not None]
    controls = controls_for(snapshot, treated, first, last, defaults)

    if treated and len(controls) >= defaults.min_controls:
        treated_skus, control_skus = {i.sku for i in treated}, {i.sku for i in controls}
        t_pre_units, t_pre_revenue = _sku_totals(snapshot, treated_skus, pre_first, pre_last)
        t_units, t_revenue = _sku_totals(snapshot, treated_skus, first, last)
        c_pre_units, _ = _sku_totals(snapshot, control_skus, pre_first, pre_last)
        c_units, _ = _sku_totals(snapshot, control_skus, first, last)
        ratio = (c_units / days) / (c_pre_units / defaults.pre_days) if c_pre_units else 1.0
        cf_units = t_pre_units / defaults.pre_days * days * ratio
        pre_price = t_pre_revenue / t_pre_units if t_pre_units else sum(i.price_vnd for i in treated) / len(treated)
        unit_cost = sum(i.unit_cost_vnd for i in treated) / len(treated)
        incremental_revenue = round(t_revenue - cf_units * pre_price)
        actual_profit = t_revenue - t_units * unit_cost
        cf_profit = cf_units * (pre_price - unit_cost)
        profit = round(actual_profit - cf_profit) - spend_vnd
        confidence = min(0.9, 0.5 + 0.05 * len(controls))
        method: Literal["did", "baseline"] = "did"
    else:
        by_weekday: dict[int, list[int]] = {}
        for row in snapshot.sales_between(pre_first, pre_last):
            by_weekday.setdefault(row.day.weekday(), []).append(row.revenue_vnd)
        means = {wd: sum(v) / len(v) for wd, v in by_weekday.items()}
        rows = snapshot.sales_between(first, last)
        incremental_revenue = round(sum(r.revenue_vnd - means.get(r.day.weekday(), r.revenue_vnd) for r in rows))
        profit = round(incremental_revenue * gross_margin_ratio(snapshot)) - spend_vnd
        confidence, method = (0.5 if len(means) == 7 else 0.3), "baseline"
    return GrowthMeasurement(
        method=method,
        days=days,
        incremental_revenue_vnd=incremental_revenue,
        incremental_profit_vnd=profit,
        spend_vnd=spend_vnd,
        roas=round(roas, 2) if roas is not None else None,
        mer=round(incremental_revenue / spend_vnd, 2) if spend_vnd else None,
        cpa_vnd=cpa,
        controls=tuple(i.sku for i in controls) if method == "did" else (),
        confidence=confidence,
        verdict=_verdict(profit, confidence, defaults),
    )
