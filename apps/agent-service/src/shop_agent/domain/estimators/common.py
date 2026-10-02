from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from shop_agent.domain.shop import StockItem

Risk = Literal["low", "medium", "high"]


@dataclass(frozen=True)
class Estimate:
    """Numbers shown to a person for one option; computed here, never by a model."""

    recovery_vnd: int
    cost_vnd: int
    waste_reduction_vnd: int
    risk: Risk = "low"
    assumptions: tuple[str, ...] = ()

    @property
    def net_vnd(self) -> int:
        return self.recovery_vnd - self.cost_vnd

    def as_dict(self) -> dict[str, object]:
        return {
            "recovery_vnd": self.recovery_vnd,
            "cost_vnd": self.cost_vnd,
            "waste_reduction_vnd": self.waste_reduction_vnd,
            "net_vnd": self.net_vnd,
            "risk": self.risk,
            "assumptions": list(self.assumptions),
        }


NOTHING = Estimate(0, 0, 0, "low", ("Không làm gì: giữ nguyên hiện trạng",))


def vnd(amount: float) -> int:
    return round(amount)


def in_stock(items: Sequence[StockItem]) -> list[StockItem]:
    return [i for i in items if i.quantity > 0]


def is_expired(item: StockItem, now: datetime) -> bool:
    return item.expiry_date is not None and item.expiry_date < now.date()


def cost_basis(items: Sequence[StockItem]) -> int:
    return sum(i.quantity * i.unit_cost_vnd for i in items)


def retail_value(items: Sequence[StockItem]) -> int:
    return sum(i.quantity * i.unit_price_vnd for i in items)


def unit_count(items: Sequence[StockItem]) -> int:
    return sum(i.quantity for i in items)
