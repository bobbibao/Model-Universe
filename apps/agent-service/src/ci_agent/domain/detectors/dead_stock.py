from __future__ import annotations

from datetime import datetime

from ci_agent.domain.detectors.base import Detector, register_detector
from ci_agent.domain.models.money import MoneyFormat
from ci_agent.domain.models.shop import ShopSnapshot
from ci_agent.domain.models.signal import Severity, Signal, make_fingerprint


@register_detector
class DeadStockDetector(Detector):
    """Old stock that barely sells (SOP-001: >= 90 days and <= 0.2 units/day)."""

    kind = "dead_stock"

    def __init__(self, min_days: int = 90, max_velocity: float = 0.2, money: MoneyFormat | None = None) -> None:
        self.min_days = min_days
        self.max_velocity = max_velocity
        self.money = money or MoneyFormat()

    @classmethod
    def create(cls, money: MoneyFormat | None = None) -> DeadStockDetector:
        return cls(money=money)

    def detect(self, snapshot: ShopSnapshot, now: datetime) -> list[Signal]:
        flagged = [i for i in snapshot.stock
                   if i.quantity > 0 and i.days_in_stock >= self.min_days
                   and snapshot.velocity(i.sku) <= self.max_velocity]
        if not flagged:
            return []
        value = sum(i.quantity * i.unit_cost for i in flagged)
        severity = Severity.HIGH if value >= 20000 else Severity.MEDIUM if value >= 5000 else Severity.LOW
        skus = tuple(sorted(i.sku for i in flagged))
        return [Signal(
            kind=self.kind,
            summary=f"{len(flagged)} SKUs are dead stock ({self.money.text(value, ',.0f')} at cost)",
            severity=severity,
            subject_skus=skus,
            detected_at=now,
            fingerprint=make_fingerprint(self.kind, skus),
            metrics={"sku_count": float(len(flagged)), "value_at_risk": round(value, 2),
                     "avg_days_in_stock": round(sum(i.days_in_stock for i in flagged) / len(flagged), 1)},
        )]
