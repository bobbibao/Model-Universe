from __future__ import annotations

from datetime import datetime

from ci_agent.domain.detectors.base import Detector, register_detector
from ci_agent.domain.models.shop import ShopSnapshot
from ci_agent.domain.models.signal import Severity, Signal, make_fingerprint


@register_detector
class NearExpiryDetector(Detector):
    """Stock that expires within N days (or already expired)."""

    kind = "near_expiry"

    def __init__(self, within_days: int = 30) -> None:
        self.within_days = within_days

    def detect(self, snapshot: ShopSnapshot, now: datetime) -> list[Signal]:
        today = now.date()
        flagged = [(i, (i.expiry_date - today).days) for i in snapshot.stock
                   if i.quantity > 0 and i.expiry_date is not None
                   and (i.expiry_date - today).days <= self.within_days]
        if not flagged:
            return []
        soonest = min(days for _, days in flagged)
        skus = tuple(sorted(i.sku for i, _ in flagged))
        value = sum(i.quantity * i.unit_cost for i, _ in flagged)
        return [Signal(
            kind=self.kind,
            summary=f"{len(skus)} SKUs expire within {self.within_days} days (soonest in {soonest} days)",
            severity=Severity.HIGH if soonest <= 7 else Severity.MEDIUM,
            subject_skus=skus,
            detected_at=now,
            fingerprint=make_fingerprint(self.kind, skus),
            metrics={"sku_count": float(len(skus)), "soonest_days": float(soonest),
                     "value_at_risk": round(value, 2)},
        )]
