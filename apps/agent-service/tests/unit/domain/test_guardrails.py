from ci_agent.domain.models.plan import ActionPlan, MeasurementPlan, PlannedAction
from ci_agent.domain.policies.guardrails import GuardrailConfig, default_engine
from tests.support.factories import make_directive

MEASURE = MeasurementPlan(("dead_stock_value",), 14)


def test_plan_within_directive_passes():
    engine = default_engine()
    directive = make_directive(skus=("A1", "A2"), limits={"max_discount_pct": 20.0, "budget_cap": 500.0})
    plan = ActionPlan.create("discount", (PlannedAction("apply_discount", {"skus": ["A1", "A2"], "percent": 20}),), MEASURE)
    assert engine.violations(plan, directive) == []


def test_discount_above_directive_cap_is_rejected():
    engine = default_engine()
    directive = make_directive(limits={"max_discount_pct": 20.0, "budget_cap": 500.0})
    plan = ActionPlan.create("discount", (PlannedAction("apply_discount", {"skus": ["A1", "A2"], "percent": 35}),), MEASURE)
    violations = engine.violations(plan, directive)
    assert any("exceeds the approved maximum" in v for v in violations)


def test_sku_outside_scope_is_rejected():
    engine = default_engine()
    directive = make_directive(skus=("A1",))
    plan = ActionPlan.create("discount", (PlannedAction("apply_discount", {"skus": ["A1", "Z9"], "percent": 20}),), MEASURE)
    violations = engine.violations(plan, directive)
    assert any("outside the approved scope" in v for v in violations)


def test_global_discount_ceiling_applies_even_if_directive_allows_more():
    engine = default_engine(GuardrailConfig(max_discount_pct=25.0))
    directive = make_directive(limits={"max_discount_pct": 90.0, "budget_cap": 5000.0})
    plan = ActionPlan.create("discount", (PlannedAction("apply_discount", {"skus": ["A1", "A2"], "percent": 80}),), MEASURE)
    violations = engine.violations(plan, directive)
    assert any("global limit" in v for v in violations)


def test_blast_radius_limit():
    engine = default_engine(GuardrailConfig(max_skus_per_plan=1))
    directive = make_directive(skus=("A1", "A2"))
    plan = ActionPlan.create("discount", (PlannedAction("apply_discount", {"skus": ["A1", "A2"], "percent": 10}),), MEASURE)
    violations = engine.violations(plan, directive)
    assert any("touches" in v for v in violations)
