from __future__ import annotations

from collections.abc import Sequence

from shop_agent.domain.estimators.common import Estimate, vnd
from shop_agent.domain.money import format_vnd
from shop_agent.domain.shop import ReturnRecord

LABOUR_PER_UNIT_VND = 50_000  # v1: 2.0 internal units


def eligible(returns: Sequence[ReturnRecord], skus: Sequence[str]) -> list[ReturnRecord]:
    scope = set(skus)
    return [r for r in returns if r.sku in scope and r.condition in ("new", "open_box")]


def estimate(returns: Sequence[ReturnRecord]) -> Estimate:
    refunds = sum(r.refund_vnd for r in returns)
    return Estimate(
        recovery_vnd=vnd(refunds * 0.7),
        cost_vnd=LABOUR_PER_UNIT_VND * len(returns),
        waste_reduction_vnd=vnd(refunds * 0.5),
        risk="low",
        assumptions=(
            "Thu hồi 70% giá trị hoàn tiền khi bán lại",
            f"Công đóng gói lại {format_vnd(LABOUR_PER_UNIT_VND)}/sản phẩm",
        ),
    )
