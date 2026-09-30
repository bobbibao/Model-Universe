"""v1 kept money in internal units (1 unit = 25,000 VND); v2 is whole VND everywhere. Every converted constant is
pinned here against its v1 value, so a slip in the conversion fails loudly."""

import pytest

from shop_agent.domain.detectors import dead_stock
from shop_agent.domain.estimators import bundle, donate, recycle, repackage
from shop_agent.domain.policies import limits, tiers

V1_UNIT_VND = 25_000


@pytest.mark.parametrize(
    ("name", "vnd", "v1_units"),
    [
        ("dead stock HIGH", dead_stock.HIGH_VALUE_VND, 20_000),
        ("dead stock MEDIUM", dead_stock.MEDIUM_VALUE_VND, 5_000),
        ("max option cost", limits.Limits().max_option_cost_vnd, 5_000),
        ("low-tier option cost", tiers.LOW_OPTION_COST_VND, 200),
        ("bundle packaging per unit", bundle.PACKAGING_PER_UNIT_VND, 0.5),
        ("donation logistics per unit", donate.LOGISTICS_PER_UNIT_VND, 0.5),
        ("recycling per unit", recycle.DISPOSAL_PER_UNIT_VND, 0.3),
        ("repackaging labour per unit", repackage.LABOUR_PER_UNIT_VND, 2.0),
    ],
)
def test_constant_is_its_v1_value_in_vnd(name: str, vnd: int, v1_units: float) -> None:
    assert isinstance(vnd, int), name
    assert vnd == round(v1_units * V1_UNIT_VND), name
