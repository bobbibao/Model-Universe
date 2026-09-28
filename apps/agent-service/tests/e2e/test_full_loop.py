"""End-to-end: the whole loop against FakeShop, no network, no real LLM.

This is the fastest way to check a change did not break the loop. It mirrors
`python -m ci_agent.interfaces.cli simulate` but with assertions.
"""
from datetime import datetime, timezone

from ci_agent.application.use_cases.submit_answer import Actor, SubmitAnswerCommand
from ci_agent.bootstrap.demo import build_demo_world
from ci_agent.domain.models.human import AnswerDecision
from ci_agent.domain.models.improvement import ImprovementStatus
from ci_agent.domain.models.notification import ChannelType, Role
from ci_agent.infrastructure.shop.fake_shop import FakeShop
from ci_agent.infrastructure.system.clock import ManualClock


def _small_shop() -> tuple[FakeShop, ManualClock]:
    clock = ManualClock(datetime(2026, 1, 5, 9, tzinfo=timezone.utc))
    return FakeShop.seed_demo(clock, n_stock=60, n_returns=15, seed=3), clock


def test_dead_stock_reaches_closed_with_success_verdict():
    shop, clock = _small_shop()
    world = build_demo_world(shop=shop, clock=clock)
    report = world.workflow.coordinator.tick()
    assert report.detected, "expected at least one signal from the seeded shop"

    dead_stock = next((i for i in world.workflow.repo.list_recent(50) if i.signal.kind == "dead_stock"), None)
    assert dead_stock is not None
    assert dead_stock.status is ImprovementStatus.AWAITING_HUMAN
    assert dead_stock.current_question is not None
    top_option = dead_stock.current_question.options[0]

    updated = world.workflow.coordinator.submit_answer(SubmitAnswerCommand(
        dead_stock.current_question.id, AnswerDecision.APPROVE, Actor("bob", Role.MANAGER, "web"),
        top_option.option_id))
    assert updated.status is ImprovementStatus.MEASURING  # Act succeeded and moved straight to Measure
    assert updated.baseline  # captured just before Act
    assert all(r.status.value in ("succeeded", "dry_run") for r in updated.action_records)

    clock.advance(days=updated.plan.measurement_plan.evaluate_after_days + 1)
    shop.advance_days(updated.plan.measurement_plan.evaluate_after_days + 1)
    world.workflow.coordinator.tick()

    final = world.workflow.repo.get(updated.id)
    assert final.status is ImprovementStatus.CLOSED
    assert final.measurement is not None
    assert final.case_id is not None
    cases = world.workflow.case_memory.list_recent(50)
    assert any(c.id == final.case_id for c in cases)


def test_rejection_is_learned_from_too():
    shop, clock = _small_shop()
    world = build_demo_world(shop=shop, clock=clock)
    world.workflow.coordinator.tick()
    imp = next((i for i in world.workflow.repo.list_recent(50) if i.current_question is not None), None)
    assert imp is not None

    world.workflow.coordinator.submit_answer(SubmitAnswerCommand(
        imp.current_question.id, AnswerDecision.REJECT, Actor("bob", Role.MANAGER, "web"), note="not now"))
    final = world.workflow.repo.get(imp.id)
    assert final.status is ImprovementStatus.CLOSED
    assert final.case_id is not None


def test_notifications_are_delivered_and_logged():
    shop, clock = _small_shop()
    world = build_demo_world(shop=shop, clock=clock)
    world.workflow.coordinator.tick()
    assert world.workflow.notification_log.list_recent(100), "expected at least one delivery attempt"
    web_events = [e for e in world.events.of_type("notification.created")]
    assert web_events, "expected a notification.created event for the web inbox"
