"""A restart loses nothing (T-02): one "process" detects and asks, a second one - new connection pool, new
adapters, same database - takes the answer, acts (re-verifying the reloaded plan hash), measures and learns.
Runs when AGENT_TEST_DATABASE_URL is set (tests/conftest.py)."""
from datetime import UTC, datetime

from ci_agent.application.use_cases.submit_answer import Actor, SubmitAnswerCommand
from ci_agent.bootstrap.demo import build_demo_world
from ci_agent.domain.models.human import AnswerDecision
from ci_agent.domain.models.improvement import ImprovementStatus
from ci_agent.domain.models.notification import Role
from ci_agent.infrastructure.persistence.postgres.database import Database
from ci_agent.infrastructure.persistence.postgres.repository import (
    PostgresImprovementRepository,
)
from ci_agent.infrastructure.persistence.postgres.stores import (
    PostgresAuditLog,
    PostgresCaseMemory,
    PostgresNotificationLog,
)
from ci_agent.infrastructure.shop.fake_shop import FakeShop
from ci_agent.infrastructure.system.clock import ManualClock
from ci_agent.infrastructure.system.ids import SequentialIds
from tests.conftest import AGENT_TEST_DATABASE_URL


def _process(database, shop, clock, prefix):
    return build_demo_world(shop=shop, clock=clock, ids=SequentialIds(prefix),
                            repo=PostgresImprovementRepository(database), case_memory=PostgresCaseMemory(database),
                            audit=PostgresAuditLog(database), notification_log=PostgresNotificationLog(database))


def test_the_loop_continues_after_a_restart(agent_db):
    clock = ManualClock(datetime(2026, 1, 5, 9, tzinfo=UTC))
    shop = FakeShop.seed_demo(clock, n_stock=60, n_returns=15, seed=3)  # the web shop outlives the agent

    before = _process(agent_db, shop, clock, "first")
    before.workflow.coordinator.tick()
    waiting = before.workflow.repo.list_by_status([ImprovementStatus.AWAITING_HUMAN])
    assert waiting
    question_ids = {i.id: i.current_question.id for i in waiting}

    restarted = Database.open(AGENT_TEST_DATABASE_URL)  # a new process: new pool, schema check passes again
    try:
        after = _process(restarted, shop, clock, "second")
        assert after.workflow.coordinator.tick().detected == []  # the cooldown still sees the stored signals
        dead = next(i for i in waiting if i.signal.kind == "dead_stock")
        # A Telegram button pressed before the restart carries only the question id.
        found = after.workflow.repo.find_by_question_id(question_ids[dead.id])
        assert found.id == dead.id and found.status is ImprovementStatus.AWAITING_HUMAN
        updated = after.workflow.coordinator.submit_answer(SubmitAnswerCommand(
            question_ids[dead.id], AnswerDecision.APPROVE, Actor("bob", Role.MANAGER, "telegram"),
            found.current_question.options[0].option_id))
        assert updated.status is ImprovementStatus.MEASURING  # Act verified the reloaded plan hash and ran

        days = updated.plan.measurement_plan.evaluate_after_days + 1
        clock.advance(days=days)
        shop.advance_days(days)
        after.workflow.coordinator.tick()
        final = after.workflow.repo.get(dead.id)
        assert final.status is ImprovementStatus.CLOSED and final.measurement is not None
        assert any(c.id == final.case_id for c in after.workflow.case_memory.list_recent(50))
        actions = [e.action for e in after.workflow.audit.list(dead.id)]
        assert actions[0] == "detected" and actions[-1] == "learned"  # one audit trail across both processes
    finally:
        restarted.close()
