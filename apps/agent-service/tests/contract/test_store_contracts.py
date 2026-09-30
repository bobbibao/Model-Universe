"""Case memory, audit log, notification log and LLM spend: the Postgres adapters behave like the in-memory ones
(the Postgres half runs when AGENT_TEST_DATABASE_URL is set, tests/conftest.py)."""
from datetime import date, timedelta

import pytest

from ci_agent.domain.models.audit import AuditEntry
from ci_agent.domain.models.case import CaseRecord
from ci_agent.domain.models.notification import ChannelType, DeliveryAttempt
from ci_agent.infrastructure.persistence.in_memory import (
    InMemoryAuditLog,
    InMemoryCaseMemory,
    InMemoryNotificationLog,
)
from ci_agent.infrastructure.reasoning.llm_reasoner import InMemorySpendStore
from tests.support.factories import NOW

KINDS = ["in_memory", "postgres"]


def _pg(request):
    from ci_agent.infrastructure.persistence.postgres import stores

    return stores, request.getfixturevalue("agent_db")


@pytest.fixture(params=KINDS)
def cases(request):
    if request.param == "in_memory":
        return InMemoryCaseMemory()
    stores, db = _pg(request)
    return stores.PostgresCaseMemory(db)


@pytest.fixture(params=KINDS)
def audit(request):
    if request.param == "in_memory":
        return InMemoryAuditLog()
    stores, db = _pg(request)
    return stores.PostgresAuditLog(db)


@pytest.fixture(params=KINDS)
def notifications(request):
    if request.param == "in_memory":
        return InMemoryNotificationLog()
    stores, db = _pg(request)
    return stores.PostgresNotificationLog(db)


@pytest.fixture(params=KINDS)
def spend(request):
    if request.param == "in_memory":
        return InMemorySpendStore()
    stores, db = _pg(request)
    return stores.PostgresLlmSpend(db)


def _case(n: int, kind: str = "dead_stock", situation: str = "jackets not selling") -> CaseRecord:
    return CaseRecord(id=f"case-{n}", improvement_id=f"imp-{n}", signal_kind=kind, situation=situation,
                      options_considered=("discount", "donate"), decision="approved:discount",
                      outcome_verdict="success", kpi_summary={"dead_stock_value": 17.5},
                      lessons=("Discounts cleared jackets.",), created_at=NOW + timedelta(minutes=n),
                      tags=(kind, "approved"))


def test_cases_round_trip_newest_first(cases):
    for n in range(3):
        cases.add(_case(n))
    assert [c.id for c in cases.list_recent(2)] == ["case-2", "case-1"]
    assert cases.list_recent(1)[0] == _case(2)


def test_case_search_ranks_by_overlap_and_filters_by_kind(cases):
    cases.add(_case(0, situation="shoes returned wrong size"))
    cases.add(_case(1, situation="jackets not selling in winter"))
    cases.add(_case(2, kind="high_returns", situation="jackets not selling"))
    assert [c.id for c in cases.search_similar("jackets not selling", "dead_stock", 2)] == ["case-1", "case-0"]
    assert [c.id for c in cases.search_similar("jackets", None, 3)] == ["case-1", "case-2", "case-0"]


def test_audit_log_keeps_the_last_entries_oldest_first(audit):
    for n in range(4):
        audit.append(AuditEntry("agent", f"step-{n}", NOW + timedelta(seconds=n), "imp-1" if n % 2 else "imp-2",
                                {"n": n}))
    assert [e.action for e in audit.list(limit=3)] == ["step-1", "step-2", "step-3"]
    assert audit.list("imp-1") == [AuditEntry("agent", "step-1", NOW + timedelta(seconds=1), "imp-1", {"n": 1}),
                                   AuditEntry("agent", "step-3", NOW + timedelta(seconds=3), "imp-1", {"n": 3})]


def test_notification_log(notifications):
    first = DeliveryAttempt("n-1", ChannelType.TELEGRAM, False, "timeout", NOW)
    second = DeliveryAttempt("n-1", ChannelType.EMAIL, True, "", NOW + timedelta(seconds=1))
    other = DeliveryAttempt("n-2", ChannelType.WEB, True, "", NOW + timedelta(seconds=2))
    for attempt in (first, second, other):
        notifications.record(attempt)
    assert notifications.list_for("n-1") == [first, second]
    assert notifications.list_recent(2) == [second, other]


def test_llm_spend_adds_up_per_day(spend):
    day = date(2026, 9, 29)
    assert spend.spent_usd(day) == 0.0
    spend.add_usd(day, 0.0123)
    spend.add_usd(day, 0.5)
    spend.add_usd(day + timedelta(days=1), 1.0)
    assert spend.spent_usd(day) == pytest.approx(0.5123)
    assert spend.spent_usd(day + timedelta(days=1)) == pytest.approx(1.0)
