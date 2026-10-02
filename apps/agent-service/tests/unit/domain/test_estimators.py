from datetime import timedelta

from hypothesis import given
from hypothesis import strategies as st

from shop_agent.domain.estimators import bundle, discount, donate, outlet, recycle, repackage
from shop_agent.domain.estimators.common import Estimate
from shop_agent.domain.shop import StockItem
from tests.support.factories import NOW, item, returned

items_strategy = st.lists(
    st.builds(
        StockItem,
        sku=st.text(min_size=1, max_size=6),
        name=st.just("x"),
        category=st.just("c"),
        quantity=st.integers(0, 10_000),
        unit_cost_vnd=st.integers(0, 50_000_000),
        unit_price_vnd=st.integers(0, 80_000_000),
        days_in_stock=st.integers(0, 1000),
        condition=st.sampled_from(["new", "open_box", "damaged"]),
    ),
    max_size=20,
)


def _non_negative(e: Estimate) -> bool:
    return e.recovery_vnd >= 0 and e.cost_vnd >= 0 and e.waste_reduction_vnd >= 0


@given(items_strategy, st.floats(0.5, 90))
def test_estimates_are_never_negative(items: list[StockItem], percent: float) -> None:
    assert _non_negative(discount.estimate(items, percent))
    assert _non_negative(outlet.estimate(items))
    assert _non_negative(bundle.estimate(items, min(percent, 60)))
    assert _non_negative(donate.estimate(items))
    assert _non_negative(recycle.estimate(items))


@given(st.floats(0, 89), st.floats(0.01, 1))
def test_discount_sell_through_rises_with_the_discount(percent: float, step: float) -> None:
    assert discount.sell_through(percent + step) >= discount.sell_through(percent)
    assert discount.sell_through(percent) <= 0.85


def test_estimates_are_whole_vnd() -> None:
    items = [item("A", quantity=7, cost=333_333, price=777_777)]
    for e in (
        discount.estimate(items, 17.5),
        outlet.estimate(items),
        bundle.estimate(items, 25),
        donate.estimate(items),
    ):
        assert all(isinstance(v, int) for v in (e.recovery_vnd, e.cost_vnd, e.waste_reduction_vnd))


def test_discount_known_answer() -> None:
    e = discount.estimate([item("A", quantity=10, cost=500_000, price=1_000_000)], 20)
    # sell-through 0.25 + 0.015 * 20 = 0.55
    assert (e.recovery_vnd, e.cost_vnd, e.waste_reduction_vnd, e.risk) == (4_400_000, 0, 2_750_000, "low")
    assert discount.estimate([item("A")], 35).risk == "medium"


def test_eligibility_rules() -> None:
    damaged, old, fresh = item("D", condition="damaged"), item("O", days=200), item("F", days=30)
    open_box, in_outlet = item("B", days=30, condition="open_box"), item("X", days=400, channel="outlet")
    assert discount.eligible([damaged, old], NOW) == [old]
    assert outlet.eligible([old, fresh, open_box, in_outlet, damaged]) == [old, open_box]
    assert recycle.eligible([damaged, old], NOW) == [damaged]
    assert [r.sku for r in repackage.eligible([returned("A"), returned("A", condition="damaged")], ["A"])] == ["A"]


def test_expired_items_are_recycled_not_discounted() -> None:
    from dataclasses import replace

    expired = replace(item("E"), expiry_date=(NOW - timedelta(days=1)).date())
    assert discount.eligible([expired], NOW) == []
    assert recycle.eligible([expired], NOW) == [expired]


def test_repackage_known_answer() -> None:
    e = repackage.estimate([returned("A", refund=400_000, n=1), returned("A", refund=600_000, n=2)])
    assert (e.recovery_vnd, e.cost_vnd, e.waste_reduction_vnd) == (700_000, 100_000, 500_000)
