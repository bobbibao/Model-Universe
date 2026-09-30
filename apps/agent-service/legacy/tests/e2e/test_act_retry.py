"""A failed Act is retried on a later run, not seconds later in the same call (phase 3 failure drill: with the web app
down, both attempts used to run within one decision and the approved plan was abandoned)."""
import logging
from datetime import UTC, datetime

from ci_agent.application.use_cases.submit_answer import Actor, SubmitAnswerCommand
from ci_agent.bootstrap.demo import build_demo_world
from ci_agent.bootstrap.wiring import WorkflowOptions
from ci_agent.domain.events import DomainEvent
from ci_agent.domain.models.human import AnswerDecision
from ci_agent.domain.models.improvement import ImprovementStatus
from ci_agent.domain.models.notification import Role
from ci_agent.infrastructure.events.web_webhook import WebWebhookPublisher
from ci_agent.infrastructure.http.recording import RecordingHttpClient
from ci_agent.infrastructure.shop.fake_shop import FakeShop
from ci_agent.infrastructure.system.clock import ManualClock


def _approved_with_the_shop_down(options=None):
    clock = ManualClock(datetime(2026, 1, 5, 9, tzinfo=UTC))
    shop = FakeShop.seed_demo(clock, n_stock=60, n_returns=15, seed=3)
    world = build_demo_world(shop=shop, clock=clock, options=options)
    world.workflow.coordinator.tick()
    dead = next(i for i in world.workflow.repo.list_recent(50) if i.signal.kind == "dead_stock")
    shop.fail_types.add("apply_discount")  # the web app is unreachable
    after = world.workflow.coordinator.submit_answer(SubmitAnswerCommand(
        dead.current_question.id, AnswerDecision.APPROVE, Actor("bob", Role.MANAGER, "web"),
        dead.current_question.options[0].option_id))
    return world, shop, after


def test_the_decision_leaves_the_plan_failed_once_and_the_next_run_retries_it():
    world, shop, after = _approved_with_the_shop_down()
    assert after.status is ImprovementStatus.ACT_FAILED and after.action_attempts == 1  # not abandoned
    shop.fail_types.clear()  # the web app is back
    report = world.workflow.coordinator.tick()
    assert report.advanced[after.id] == ImprovementStatus.MEASURING.value
    final = world.workflow.repo.get(after.id)
    assert final.action_attempts == 2 and shop.apply_counts["apply_discount"] == 1  # applied once, by attempt 2


def test_a_plan_still_failing_on_the_next_run_is_abandoned_then():
    world, shop, after = _approved_with_the_shop_down()
    report = world.workflow.coordinator.tick()  # still down: second attempt fails, attempts are used up
    assert report.advanced[after.id] == ImprovementStatus.CLOSED.value
    assert "apply_discount" not in shop.apply_counts


def test_undelivered_web_events_are_logged(caplog):
    publisher = WebWebhookPublisher("http://web/api/agent/v1/events", "secret", RecordingHttpClient(status=0))
    event = DomainEvent("improvement.detected", "imp-1", datetime(2026, 1, 5, tzinfo=UTC), {})
    with caplog.at_level(logging.WARNING):
        publisher.publish([event])
    assert "Web events not delivered (HTTP unreachable): improvement.detected@imp-1" in caplog.text


def test_a_failure_older_than_the_retry_window_is_abandoned_not_acted_on_days_later():
    world, shop, after = _approved_with_the_shop_down()
    shop.fail_types.clear()  # the web is back, but the approval is 25 hours old
    world.clock.advance(hours=25)
    report = world.workflow.coordinator.tick()
    assert report.advanced[after.id] == ImprovementStatus.CLOSED.value
    assert "apply_discount" not in shop.apply_counts  # nothing acted on the stale approval
    abandoned = [e for e in world.workflow.audit.list(after.id) if e.action == "action_abandoned"][-1]
    assert abandoned.detail == {"attempts": 1, "reason": "retry window expired"}


def test_one_attempt_per_run_also_with_more_attempts_allowed():
    world, _, after = _approved_with_the_shop_down(WorkflowOptions(max_action_attempts=3))
    world.workflow.coordinator.tick()
    assert world.workflow.repo.get(after.id).action_attempts == 2  # one more attempt, not two
    world.workflow.coordinator.tick()
    last = world.workflow.repo.get(after.id)
    assert last.status is ImprovementStatus.CLOSED and last.action_attempts == 3  # the final failure abandons at once
