from __future__ import annotations

from collections import Counter
from datetime import datetime

from shop_agent.domain.models import Opportunity, Severity, make_fingerprint
from shop_agent.domain.shop import ShopSnapshot


class HighReturnRateDetector:
    """SKUs whose return rate exceeds the SOP-002 threshold (default 8%)."""

    kind = "high_returns"

    def __init__(self, min_rate_pct: float = 8.0, min_returns: int = 3) -> None:
        self.min_rate_pct = min_rate_pct
        self.min_returns = min_returns

    def detect(self, snapshot: ShopSnapshot, now: datetime) -> list[Opportunity]:
        counts = Counter(r.sku for r in snapshot.returns)
        rates: dict[str, float] = {}
        for sku, returned in counts.items():
            sold = snapshot.units_sold_30d.get(sku, 0)
            rate = (returned / sold * 100.0) if sold > 0 else 100.0
            if returned >= self.min_returns and rate >= self.min_rate_pct:
                rates[sku] = rate
        if not rates:
            return []
        worst = max(rates.values())
        skus = tuple(sorted(rates))
        return [
            Opportunity(
                kind=self.kind,
                fingerprint=make_fingerprint(self.kind, skus),
                severity=Severity.HIGH if worst >= 20 else Severity.MEDIUM,
                title=f"Tỷ lệ đổi trả cao: {len(skus)} mã",
                summary=f"{len(skus)} mã vượt ngưỡng đổi trả {self.min_rate_pct:g}% (cao nhất {worst:.1f}%)",
                evidence={
                    "sku_count": len(skus),
                    "worst_rate_pct": round(worst, 1),
                    "returns": sum(counts[s] for s in skus),
                },
                skus=skus,
                detected_at=now,
            )
        ]
