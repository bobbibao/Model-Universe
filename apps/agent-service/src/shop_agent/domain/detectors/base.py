from __future__ import annotations

from datetime import datetime
from typing import Protocol

from shop_agent.domain.models import Opportunity
from shop_agent.domain.shop import ShopSnapshot


class Detector(Protocol):
    kind: str

    def detect(self, snapshot: ShopSnapshot, now: datetime) -> list[Opportunity]: ...


def default_detectors() -> list[Detector]:
    from shop_agent.domain.detectors.dead_stock import DeadStockDetector
    from shop_agent.domain.detectors.high_returns import HighReturnRateDetector

    return [DeadStockDetector(), HighReturnRateDetector()]
