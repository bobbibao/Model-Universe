import pytest
from hypothesis import given
from hypothesis import strategies as st

from shop_agent.domain.actions import ActionDraft
from shop_agent.domain.capabilities import Capability, RiskTier
from shop_agent.domain.estimators.common import Estimate
from shop_agent.domain.models import Severity
from shop_agent.domain.policies.autonomy import AutonomyMode, AutonomySettings, Route, route
from shop_agent.domain.policies.limits import LimitExceeded, Limits, check_action, option_violations
from shop_agent.domain.policies.tiers import action_tier, option_tier


def _discount(percent: float, days: int = 7, skus: int = 3) -> ActionDraft:
    body = {"skus": [f"S{i}" for i in range(skus)], "percent": percent, "duration_days": days}
    return ActionDraft(type="apply_discount", body=body)


@given(st.floats(0.01, 40), st.floats(0.01, 50))
def test_a_discount_above_the_limit_is_always_rejected(limit: float, excess: float) -> None:
    with pytest.raises(LimitExceeded, match="above the limit"):
        check_action(_discount(limit + excess), Limits(max_discount_pct=limit))
    check_action(_discount(limit), Limits(max_discount_pct=limit))


@given(st.integers(1, 50), st.integers(1, 30))
def test_too_many_skus_are_always_rejected(limit: int, excess: int) -> None:
    with pytest.raises(LimitExceeded, match="SKUs"):
        check_action(_discount(10, skus=limit + excess), Limits(max_skus_per_option=limit))


@given(st.integers(0, 10**10), st.integers(1, 10**9))
def test_an_option_above_the_cost_limit_is_always_rejected(limit: int, excess: int) -> None:
    estimate = Estimate(recovery_vnd=0, cost_vnd=limit + excess, waste_reduction_vnd=0)
    assert any("estimated cost" in p for p in option_violations([], estimate, Limits(max_option_cost_vnd=limit)))


def test_option_counts_skus_across_actions() -> None:
    a = ActionDraft(type="switch_channel", body={"skus": ["A", "B"], "to_channel": "outlet"})
    b = ActionDraft(type="adjust_inventory", body={"sku": "C", "new_status": "quarantine"})
    problems = option_violations([a, b], Estimate(0, 0, 0), Limits(max_skus_per_option=2))
    assert problems == ["option touches 3 SKUs, above the limit of 2"]


@pytest.mark.parametrize(
    ("action", "tier"),
    [
        (_discount(15, 7, 20), RiskTier.LOW),
        (_discount(15.5, 7, 20), RiskTier.MEDIUM),
        (_discount(15, 8, 20), RiskTier.MEDIUM),
        (_discount(15, 7, 21), RiskTier.MEDIUM),
        (ActionDraft(type="create_task", body={"title": "t", "assignee_role": "r"}), RiskTier.LOW),
    ],
)
def test_action_tiers(action: ActionDraft, tier: RiskTier) -> None:
    assert action_tier(action) is tier


def test_option_tier_is_raised_by_cost_risk_or_severity() -> None:
    low = [_discount(10)]
    assert option_tier(low, Estimate(0, 5_000_000, 0), Severity.MEDIUM) is RiskTier.LOW
    assert option_tier(low, Estimate(0, 5_000_001, 0), Severity.MEDIUM) is RiskTier.MEDIUM
    assert option_tier(low, Estimate(0, 0, 0, risk="medium"), Severity.LOW) is RiskTier.MEDIUM
    assert option_tier(low, Estimate(0, 0, 0), Severity.HIGH) is RiskTier.MEDIUM


PROMO_LOW = [(Capability.PROMOTION, RiskTier.LOW)]


@pytest.mark.parametrize(
    ("modes", "actions", "needs_human", "expected"),
    [
        ({}, PROMO_LOW, False, Route.ASK),  # default: ask
        ({Capability.PROMOTION: AutonomyMode.AUTO_LOW}, PROMO_LOW, False, Route.AUTO),
        ({Capability.PROMOTION: AutonomyMode.AUTO_LOW}, PROMO_LOW, True, Route.ASK),
        ({Capability.PROMOTION: AutonomyMode.AUTO_LOW}, [(Capability.PROMOTION, RiskTier.MEDIUM)], False, Route.ASK),
        (
            {Capability.PROMOTION: AutonomyMode.AUTO_LOW},
            [*PROMO_LOW, (Capability.OPS_TASKS, RiskTier.LOW)],
            False,
            Route.ASK,  # every capability must be in auto_low
        ),
        ({Capability.PROMOTION: AutonomyMode.SHADOW}, PROMO_LOW, False, Route.SHADOW),
        ({Capability.PROMOTION: AutonomyMode.OFF}, PROMO_LOW, False, Route.BLOCKED),
        ({}, [(Capability.PROMOTION, RiskTier.BLOCKED)], False, Route.BLOCKED),
        ({}, [], False, Route.ASK),
    ],
)
def test_autonomy_routes(
    modes: dict[Capability, AutonomyMode],
    actions: list[tuple[Capability, RiskTier]],
    needs_human: bool,
    expected: Route,
) -> None:
    assert route(actions, AutonomySettings(modes), needs_human=needs_human)[0] is expected
