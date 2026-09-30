from __future__ import annotations

from datetime import datetime

from shop_agent.domain.models import Opportunity, Severity, make_fingerprint
from shop_agent.domain.money import format_vnd
from shop_agent.domain.shop import ShopSnapshot

# Severity by value at cost (v1 thresholds 20,000 / 5,000 internal units x 25,000 VND).
HIGH_VALUE_VND = 500_000_000
MEDIUM_VALUE_VND = 125_000_000


class DeadStockDetector:
    """Old stock that barely sells (SOP-001: >= 90 days in stock and <= 0.2 units sold per day)."""

    kind = "dead_stock"

    def __init__(self, min_days: int = 90, max_velocity: float = 0.2) -> None:
        self.min_days = min_days
        self.max_velocity = max_velocity

    def detect(self, snapshot: ShopSnapshot, now: datetime) -> list[Opportunity]:
        flagged = [
            i
            for i in snapshot.stock
            if i.quantity > 0 and i.days_in_stock >= self.min_days and snapshot.velocity(i.sku) <= self.max_velocity
        ]
        if not flagged:
            return []
        value = sum(i.quantity * i.unit_cost_vnd for i in flagged)
        severity = (
            Severity.HIGH if value >= HIGH_VALUE_VND else Severity.MEDIUM if value >= MEDIUM_VALUE_VND else Severity.LOW
        )
        skus = tuple(sorted(i.sku for i in flagged))
        return [
            Opportunity(
                kind=self.kind,
                fingerprint=make_fingerprint(self.kind, skus),
                severity=severity,
                title=f"Hàng tồn lâu: {len(flagged)} mã",
                summary=f"{len(flagged)} mã tồn kho lâu, bán chậm (giá vốn {format_vnd(value)})",
                evidence={
                    "sku_count": len(flagged),
                    "value_at_risk_vnd": value,
                    "avg_days_in_stock": round(sum(i.days_in_stock for i in flagged) / len(flagged), 1),
                },
                skus=skus,
                detected_at=now,
            )
        ]
