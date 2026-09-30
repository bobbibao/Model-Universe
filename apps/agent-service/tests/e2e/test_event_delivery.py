"""Every domain event reaches the web webhook exactly once, even though the loop reloads and saves the
aggregate many times between Detect and Learn."""
from collections import Counter
from datetime import UTC, datetime

from ci_agent.application.use_cases.submit_answer import Actor, SubmitAnswerCommand
from ci_agent.bootstrap.demo import build_demo_world
from ci_agent.bootstrap.wiring import WorkflowOptions
from ci_agent.domain.models.human import AnswerDecision
from ci_agent.domain.models.money import MoneyFormat
from ci_agent.domain.models.notification import Role
from ci_agent.domain.policies.guardrails import GuardrailConfig
from ci_agent.infrastructure.shop.fake_shop import FakeShop
from ci_agent.infrastructure.system.clock import ManualClock


def test_each_event_is_published_once():
    clock = ManualClock(datetime(2026, 1, 5, 9, tzinfo=UTC))
    world = build_demo_world(shop=FakeShop.seed_demo(clock, n_stock=60, n_returns=15, seed=3), clock=clock)
    world.workflow.coordinator.tick()
    imp = next(i for i in world.workflow.repo.list_recent(50) if i.current_question is not None)
    q = imp.current_question
    world.workflow.coordinator.submit_answer(SubmitAnswerCommand(
        q.id, AnswerDecision.APPROVE, Actor("bob", Role.MANAGER, "web"), q.recommended_option_id))

    counts = Counter((e.type, e.improvement_id, e.occurred_at, repr(e.payload))
                     for e in world.events.events if e.type != "notification.created")
    duplicated = {key[:2]: n for key, n in counts.items() if n > 1}
    assert not duplicated, f"events published more than once: {duplicated}"
    assert len([e for e in world.events.of_type("improvement.detected") if e.improvement_id == imp.id]) == 1


def test_agent_text_is_in_vnd_end_to_end_when_configured():
    clock = ManualClock(datetime(2026, 1, 5, 9, tzinfo=UTC))
    world = build_demo_world(shop=FakeShop.seed_demo(clock, n_stock=60, n_returns=15, seed=3), clock=clock,
                             options=WorkflowOptions(money=MoneyFormat(25_000)))
    world.workflow.coordinator.tick()
    dead = next(i for i in world.workflow.repo.list_recent(50) if i.signal.kind == "dead_stock")
    assert dead.signal.summary.endswith(" ₫ at cost)")
    questions = [e.payload["body"] for e in world.events.of_type("notification.created")
                 if e.payload["kind"] == "question" and e.improvement_id == dead.id]
    assert questions and all("₫" in body and "est. recovery" in body for body in questions)


def _vnd_world(**options):
    clock = ManualClock(datetime(2026, 1, 5, 9, tzinfo=UTC))
    shop = FakeShop.seed_demo(clock, n_stock=60, n_returns=15, seed=3)
    world = build_demo_world(shop=shop, clock=clock, options=WorkflowOptions(money=MoneyFormat(25_000), **options))
    world.workflow.coordinator.tick()
    return world, next(i for i in world.workflow.repo.list_recent(50) if i.signal.kind == "dead_stock")


def _approve(world, imp, strategy):
    q = imp.current_question
    option = next(o for o in q.options if o.strategy == strategy)
    return world.workflow.coordinator.submit_answer(SubmitAnswerCommand(
        q.id, AnswerDecision.APPROVE, Actor("bob", Role.MANAGER, "web"), option.option_id))


def test_measurement_text_is_in_vnd_when_configured():
    world, dead = _vnd_world()
    acted = _approve(world, dead, "discount")
    days = acted.plan.measurement_plan.evaluate_after_days + 1
    world.clock.advance(days=days)
    world.shop.advance_days(days)
    world.workflow.coordinator.tick()
    measured = world.workflow.repo.get(dead.id)
    assert measured.measurement is not None and "₫ ->" in measured.measurement.summary
    bodies = [e.payload["body"] for e in world.events.of_type("notification.created")
              if e.payload["kind"] == "measurement_ready" and e.improvement_id == dead.id]
    assert bodies and all("₫" in body for body in bodies)


def test_guardrail_text_is_in_vnd_when_configured():
    # A plan-cost ceiling of 1 unit (25,000 VND) makes the bundle plan (0.50 per unit) violate the global guardrail.
    world, dead = _vnd_world(guardrails=GuardrailConfig(max_plan_cost=1.0))
    _approve(world, dead, "bundle")
    reasked = world.workflow.repo.get(dead.id).current_question
    assert reasked is not None and "above the global limit 25.000 ₫" in reasked.context
