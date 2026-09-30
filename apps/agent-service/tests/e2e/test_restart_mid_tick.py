"""A restart in the middle of a run (T-09): the process dies while the second improvement is being investigated;
the next run, in a new process on the same database, finishes the job with no duplicate improvement, question,
notification or audit step. Runs when AGENT_TEST_DATABASE_URL is set (tests/conftest.py)."""
from collections import Counter
from datetime import UTC, datetime

import pytest

from ci_agent.bootstrap.demo import build_demo_world
from ci_agent.domain.models.improvement import ImprovementStatus
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
from ci_agent.interfaces.runs import RunManager
from tests.conftest import AGENT_TEST_DATABASE_URL


class Crash(BaseException):
    pass


class CrashOnSecondInvestigation:
    def __init__(self, repo) -> None:
        self._repo, self.investigations = repo, 0

    def save(self, improvement) -> None:
        if improvement.status is ImprovementStatus.INVESTIGATING and improvement.finding is not None:
            self.investigations += 1
            if self.investigations == 2:
                raise Crash("killed while saving the second analysis")
        self._repo.save(improvement)

    def __getattr__(self, name):
        return getattr(self._repo, name)


def _process(database, repo, shop, clock, prefix):
    return build_demo_world(shop=shop, clock=clock, ids=SequentialIds(prefix), repo=repo,
                            case_memory=PostgresCaseMemory(database), audit=PostgresAuditLog(database),
                            notification_log=PostgresNotificationLog(database))


def test_a_run_interrupted_mid_tick_is_finished_by_the_next_one_without_duplicates(agent_db):
    clock = ManualClock(datetime(2026, 1, 5, 9, tzinfo=UTC))
    shop = FakeShop.seed_demo(clock, n_stock=60, n_returns=15, seed=3)
    first = _process(agent_db, CrashOnSecondInvestigation(PostgresImprovementRepository(agent_db)), shop, clock, "a")
    with pytest.raises(Crash):
        RunManager(first.workflow.coordinator.tick).run("scheduler")
    detected = PostgresImprovementRepository(agent_db).list_recent(50)
    assert len(detected) >= 2
    assert Counter(i.status for i in detected)[ImprovementStatus.AWAITING_HUMAN] == 1  # only the first got through

    restarted = Database.open(AGENT_TEST_DATABASE_URL)
    try:
        second = _process(restarted, PostgresImprovementRepository(restarted), shop, clock, "b")
        report = RunManager(second.workflow.coordinator.tick).run("scheduler")
        assert report.detected == [] and not report.errors  # the stored signals are still in cooldown
        final = second.workflow.repo.list_recent(50)
        assert sorted(i.id for i in final) == sorted(i.id for i in detected)  # no duplicate improvement
        assert all(i.status is ImprovementStatus.AWAITING_HUMAN and len(i.questions) == 1 for i in final)
        for imp in final:
            steps = Counter(e.action for e in second.workflow.audit.list(imp.id))
            assert steps["detected"] == 1 and steps["asked_human"] == 1, (imp.id, steps)
    finally:
        restarted.close()
