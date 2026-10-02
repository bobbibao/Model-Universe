"""`overstock` (more cover than the shop can sell) and `rising_demand` (a category selling faster, with stock left)."""

from __future__ import annotations

from collections import defaultdict

from shop_agent.domain.growth.defaults import GrowthDefaults
from shop_agent.domain.growth.demand import cover_days, is_new_arrival, sellable_items, velocity
from shop_agent.domain.growth.detectors.base import MAX_SKUS, month_bucket, week_bucket
from shop_agent.domain.growth.snapshot import CatalogItem, GrowthSnapshot
from shop_agent.domain.models import Opportunity, Severity, make_fingerprint
from shop_agent.domain.money import format_vnd


class OverstockDetector:
    """SKUs that sell (otherwise they are `dead_stock`) but hold more than `overstock_cover_days` of stock."""

    kind = "overstock"

    def detect(self, snapshot: GrowthSnapshot, defaults: GrowthDefaults) -> list[Opportunity]:
        d = defaults.detectors
        by_category: dict[str, list[tuple[CatalogItem, float, int]]] = defaultdict(list)
        for item in sellable_items(snapshot):
            if item.quantity < d.overstock_min_units or is_new_arrival(item, snapshot, d.new_arrival_days):
                continue
            daily = velocity(snapshot, [item.sku], d.velocity_days)
            cover = cover_days(item, daily)
            if daily <= 0 or cover <= d.overstock_cover_days:
                continue
            excess_units = item.quantity - round(daily * d.overstock_cover_days)
            by_category[item.category].append((item, cover, excess_units * item.unit_cost_vnd))
        found = []
        for category, rows in sorted(by_category.items()):
            rows.sort(key=lambda row: (-row[2], row[0].sku))
            top = rows[:MAX_SKUS]
            excess_vnd = sum(row[2] for row in top)
            severity = (
                Severity.HIGH
                if excess_vnd >= 50_000_000
                else Severity.MEDIUM
                if excess_vnd >= 10_000_000
                else Severity.LOW
            )
            skus = tuple(row[0].sku for row in top)
            found.append(
                Opportunity(
                    kind=self.kind,
                    fingerprint=make_fingerprint(self.kind, skus, month_bucket(snapshot.today)),
                    severity=severity,
                    title=f"Tồn kho dư ở nhóm {top[0][0].category_name}",
                    summary=(
                        f"{len(top)} mã có lượng tồn đủ bán hơn {d.overstock_cover_days:.0f} ngày; "
                        f"phần dư trị giá {format_vnd(excess_vnd)} theo giá vốn."
                    ),
                    evidence={
                        "category": category,
                        "skus": len(top),
                        "excess_value_vnd": excess_vnd,
                        "max_cover_days": round(min(max(row[1] for row in top), 9999)),
                    },
                    skus=skus,
                    detected_at=snapshot.taken_at,
                )
            )
        return found


class RisingDemandDetector:
    """A category selling `rising_ratio` times faster over 7 days than 28, with `rising_min_cover_days` of stock."""

    kind = "rising_demand"

    def detect(self, snapshot: GrowthSnapshot, defaults: GrowthDefaults) -> list[Opportunity]:
        d = defaults.detectors
        by_category: dict[str, list[CatalogItem]] = defaultdict(list)
        for item in sellable_items(snapshot):
            by_category[item.category].append(item)
        found = []
        for category, items in sorted(by_category.items()):
            skus = [i.sku for i in items]
            recent, base = velocity(snapshot, skus, 7), velocity(snapshot, skus, d.velocity_days)
            if recent * 7 < d.rising_min_units_7d or base <= 0 or recent < d.rising_ratio * base:
                continue
            stock = sum(i.quantity for i in items)
            cover = stock / recent
            if cover < d.rising_min_cover_days:
                continue
            ranked = sorted(items, key=lambda i: (-velocity(snapshot, [i.sku], 7), i.sku))[:MAX_SKUS]
            scope = tuple(i.sku for i in ranked)
            found.append(
                Opportunity(
                    kind=self.kind,
                    fingerprint=make_fingerprint(self.kind, [category], week_bucket(snapshot.today)),
                    severity=Severity.MEDIUM,
                    title=f"Nhu cầu tăng ở nhóm {items[0].category_name}",
                    summary=(
                        f"7 ngày qua bán {recent:.1f} sản phẩm/ngày, gấp {recent / base:.1f} lần mức 28 ngày; "
                        f"tồn kho đủ bán {cover:.0f} ngày."
                    ),
                    evidence={
                        "category": category,
                        "velocity_7d": round(recent, 2),
                        "velocity_28d": round(base, 2),
                        "ratio": round(recent / base, 2),
                        "cover_days": round(cover),
                    },
                    skus=scope,
                    detected_at=snapshot.taken_at,
                )
            )
        return found
