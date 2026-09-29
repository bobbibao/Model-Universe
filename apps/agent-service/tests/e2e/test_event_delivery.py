"""Every domain event reaches the web webhook exactly once, even though the loop reloads and saves the
aggregate many times between Detect and Learn."""
from collections import Counter
from datetime import UTC, datetime

from ci_agent.application.use_cases.submit_answer import Actor, SubmitAnswerCommand
from ci_agent.bootstrap.demo import build_demo_world
from ci_agent.domain.models.human import AnswerDecision
from ci_agent.domain.models.notification import Role
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
