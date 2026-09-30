"""A crash mid-Act (T-02 follow-up): the web calls are done but the agent dies before saving the result. After a
restart the next tick runs Act again with the SAME idempotency keys and bodies, so the web replays its stored
responses and applies nothing twice. Runs in memory always, and on Postgres when AGENT_TEST_DATABASE_URL is set."""
from datetime import UTC, datetime

import pytest

from ci_agent.application.use_cases.submit_answer import Actor, SubmitAnswerCommand
from ci_agent.bootstrap.demo import build_demo_world
from ci_agent.domain.models.human import AnswerDecision
from ci_agent.domain.models.improvement import ImprovementStatus
from ci_agent.domain.models.notification import Role
from ci_agent.domain.models.plan import ActionStatus
from ci_agent.infrastructure.persistence.in_memory import InMemoryImprovementRepository
from ci_agent.infrastructure.shop.fake_shop import FakeShop
from ci_agent.infrastructure.shop.http_action import HttpShopActionAdapter
from ci_agent.infrastructure.system.clock import ManualClock
from ci_agent.infrastructure.system.ids import SequentialIds
from tests.support.web_double import IdempotentWebDouble

ACT_RESULTS = (ImprovementStatus.MEASURING, ImprovementStatus.ACT_FAILED)


class Crash(BaseException):
    """The process dies: not an Exception, so nothing in the loop can swallow it."""


class CrashBeforeSavingActResult:
    """Delegates to a real repository, but dies once, right before the result of Act would be saved."""

    def __init__(self, repo) -> None:
        self._repo, self.armed = repo, True

    def save(self, improvement) -> None:
        if self.armed and improvement.status in ACT_RESULTS:
            self.armed = False
            raise Crash("killed after the web calls, before the save")
        self._repo.save(improvement)

    def __getattr__(self, name):
        return getattr(self._repo, name)


@pytest.fixture(params=["in_memory", "postgres"])
def storage(request):
    """(repository for the first process, factory of a fresh repository for the restarted process)."""
    if request.param == "in_memory":
        repo = InMemoryImprovementRepository()
        yield repo, lambda: repo
        return
    from ci_agent.infrastructure.persistence.postgres.database import Database
    from ci_agent.infrastructure.persistence.postgres.repository import (
        PostgresImprovementRepository,
    )
    from tests.conftest import AGENT_TEST_DATABASE_URL

    first = PostgresImprovementRepository(request.getfixturevalue("agent_db"))
    reopened = []

    def restart():
        database = Database.open(AGENT_TEST_DATABASE_URL)  # a new process: new connection pool
        reopened.append(database)
        return PostgresImprovementRepository(database)

    yield first, restart
    for database in reopened:
        database.close()


def test_a_crash_after_the_web_calls_replays_the_same_keys_and_applies_nothing_twice(storage):
    first_repo, restarted_repo = storage
    clock = ManualClock(datetime(2026, 1, 5, 9, tzinfo=UTC))
    shop = FakeShop.seed_demo(clock, n_stock=60, n_returns=15, seed=3)  # reads; writes go to the web double
    web = IdempotentWebDouble()  # the web app outlives the agent

    def process(repo, prefix):
        return build_demo_world(shop=shop, clock=clock, repo=repo, ids=SequentialIds(prefix),
                                shop_actions=HttpShopActionAdapter("http://web/api/agent/v1", "token", web))

    crashing = CrashBeforeSavingActResult(first_repo)
    before = process(crashing, "first")
    before.workflow.coordinator.tick()
    dead = next(i for i in first_repo.list_by_status([ImprovementStatus.AWAITING_HUMAN])
                if i.signal.kind == "dead_stock")
    with pytest.raises(Crash):
        before.workflow.coordinator.submit_answer(SubmitAnswerCommand(
            dead.current_question.id, AnswerDecision.APPROVE, Actor("bob", Role.MANAGER, "web"),
            dead.current_question.options[0].option_id))

    applied_before = list(web.applied)
    first_attempt = [r for r in web.requests if '"dry_run": true' not in r[2]]
    assert applied_before, "the web calls happened before the crash"
    stored = first_repo.get(dead.id)
    assert stored.status is ImprovementStatus.PLANNED and stored.action_attempts == 0  # the result was never saved

    after = process(restarted_repo(), "second")
    after.workflow.coordinator.tick()

    final = after.workflow.repo.get(dead.id)
    assert final.status is ImprovementStatus.MEASURING
    assert web.applied == applied_before, "nothing was applied a second time"
    assert web.conflicts == 0 and web.replays == len(applied_before)
    second_attempt = [r for r in web.requests if '"dry_run": true' not in r[2]][len(first_attempt):]
    assert second_attempt == first_attempt  # same URLs, same Idempotency-Keys, byte-identical bodies
    assert [r.idempotency_key for r in final.action_records] == applied_before
    assert all(r.status is ActionStatus.SUCCEEDED for r in final.action_records)
    assert [r.external_ref for r in final.action_records] == [web.stored[k][1]["ref"] for k in applied_before]
