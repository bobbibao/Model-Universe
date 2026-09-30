import pytest
from pydantic import ValidationError

from shop_agent.domain.actions import ACTIONS, ActionDraft, normalize_body, to_spec
from shop_agent.domain.kpi import DEAD_STOCK_VALUE, RECOVERED_VALUE, RETURN_RATE_PCT
from shop_agent.domain.kpi_calc import snapshot_kpis
from shop_agent.domain.measurement import MeasurementPlan, Verdict, evaluate
from shop_agent.domain.money import format_vnd
from tests.support.factories import NOW, SAMPLE_BODIES, discount, item, snapshot


@pytest.mark.parametrize(("amount", "text"), [(0, "0 ₫"), (1_072_300, "1.072.300 ₫"), (-5_000, "-5.000 ₫")])
def test_format_vnd(amount: int, text: str) -> None:
    assert format_vnd(amount) == text


def test_every_action_type_has_a_sample_body_that_validates() -> None:
    assert set(SAMPLE_BODIES) == set(ACTIONS)
    for action_type, body in SAMPLE_BODIES.items():
        assert normalize_body(action_type, dict(body)) == body


def test_bodies_are_validated_and_none_dropped() -> None:
    assert normalize_body("create_task", {"title": "t", "assignee_role": "r", "due_in_days": None}) == {
        "title": "t",
        "assignee_role": "r",
    }
    with pytest.raises(ValidationError):
        normalize_body("apply_discount", {"skus": ["A"], "percent": 20, "duration_days": 7, "dry_run": True})
    with pytest.raises(ValidationError):
        to_spec(
            ActionDraft(type="apply_discount", body={"skus": [], "percent": 20, "duration_days": 7}),
            action_id="a",
            idempotency_key="k",
        )


def test_edits_only_touch_editable_fields_and_are_revalidated() -> None:
    spec = discount(percent=20)
    assert spec.with_edits({"percent": 25}).body["percent"] == 25
    assert spec.with_edits({"percent": 25}).idempotency_key == spec.idempotency_key
    with pytest.raises(ValueError, match="cannot be edited"):
        spec.with_edits({"skus": ["Z"]})
    with pytest.raises(ValidationError):
        spec.with_edits({"percent": 120})


def test_snapshot_kpis_definitions() -> None:
    snap = snapshot(item("A", quantity=10, days=100), item("B", quantity=0, days=300), sold={"A": 3})
    kpis = snapshot_kpis(snap)
    assert kpis[DEAD_STOCK_VALUE] == 10 * 500_000
    assert kpis[RETURN_RATE_PCT] == 0.0
    assert kpis["avg_days_in_stock"] == 100.0
    assert kpis[RECOVERED_VALUE] == 0.0


def test_measurement_verdicts() -> None:
    plan = MeasurementPlan((DEAD_STOCK_VALUE,), 14, min_improvement_pct=10.0)
    success = evaluate(plan, {DEAD_STOCK_VALUE: 1_000_000}, {DEAD_STOCK_VALUE: 400_000}, NOW)
    assert success.verdict is Verdict.SUCCESS and success.deltas[0].improved
    assert "1.000.000 ₫ -> 400.000 ₫" in success.summary
    worse = evaluate(plan, {DEAD_STOCK_VALUE: 1_000_000}, {DEAD_STOCK_VALUE: 1_300_000}, NOW)
    assert worse.verdict is Verdict.NEGATIVE
    flat = evaluate(plan, {DEAD_STOCK_VALUE: 1_000_000}, {DEAD_STOCK_VALUE: 960_000}, NOW)
    assert flat.verdict is Verdict.INCONCLUSIVE
    recovered = MeasurementPlan((RECOVERED_VALUE,), 14, 10.0)
    assert evaluate(recovered, {RECOVERED_VALUE: 0}, {RECOVERED_VALUE: 5}, NOW).verdict is Verdict.SUCCESS


def test_an_option_edit_goes_to_every_action_that_declares_the_field() -> None:
    from shop_agent.domain.actions import apply_edits

    task = to_spec(
        ActionDraft(type="create_task", body={"title": "Hiển thị", "assignee_role": "merchandiser", "due_in_days": 2}),
        action_id="a2",
        idempotency_key="t1:discount:2",
    )
    edited = apply_edits([discount(percent=20), task], {"percent": 25, "due_in_days": 1})
    assert edited[0].body["percent"] == 25.0 and edited[0].idempotency_key == "t1:discount:1"
    assert edited[1].body["due_in_days"] == 1 and edited[1].body["title"] == "Hiển thị"
    assert apply_edits([task], {}) == [task]
    with pytest.raises(ValueError, match="cannot be edited in this option"):
        apply_edits([task], {"percent": 25})
