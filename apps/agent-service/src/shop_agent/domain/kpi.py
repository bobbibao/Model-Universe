"""KPI catalog: what Measure compares before and after an action."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

DEAD_STOCK_VALUE = "dead_stock_value_vnd"
RETURN_RATE_PCT = "return_rate_pct"
RECOVERED_VALUE = "recovered_value_vnd"
AVG_DAYS_IN_STOCK = "avg_days_in_stock"


@dataclass(frozen=True)
class KpiDefinition:
    name: str
    unit: Literal["vnd", "percent", "days"]
    higher_is_better: bool
    label: str  # for people (Vietnamese)


KPI_CATALOG: dict[str, KpiDefinition] = {
    k.name: k
    for k in (
        KpiDefinition(DEAD_STOCK_VALUE, "vnd", False, "Giá trị hàng tồn lâu"),
        KpiDefinition(RETURN_RATE_PCT, "percent", False, "Tỷ lệ đổi trả 30 ngày"),
        KpiDefinition(RECOVERED_VALUE, "vnd", True, "Doanh thu thu hồi từ xả hàng"),
        KpiDefinition(AVG_DAYS_IN_STOCK, "days", False, "Số ngày tồn kho trung bình"),
    )
}


def get_kpi(name: str) -> KpiDefinition:
    try:
        return KPI_CATALOG[name]
    except KeyError as exc:
        raise ValueError(f"unknown KPI {name!r}") from exc
