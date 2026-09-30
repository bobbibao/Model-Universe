"""A contract every ImprovementRepository implementation must satisfy.

Runs against the in-memory adapter always, and against PostgresImprovementRepository when AGENT_TEST_DATABASE_URL
points at a throwaway database (tests/conftest.py), so the same tests protect both implementations.
"""
from datetime import timedelta

import pytest

from ci_agent.application.errors import ConflictError
from ci_agent.domain.models.improvement import Improvement, ImprovementStatus
from ci_agent.infrastructure.persistence.in_memory import InMemoryImprovementRepository
from tests.support.factories import NOW, make_option, make_signal


@pytest.fixture(params=["in_memory", "postgres"])
def repo(request):
    if request.param == "in_memory":
        return InMemoryImprovementRepository()
    from ci_agent.infrastructure.persistence.postgres.repository import (
        PostgresImprovementRepository,
    )

    return PostgresImprovementRepository(request.getfixturevalue("agent_db"))


def test_add_then_get_round_trips(repo):
    imp = Improvement.detect("imp-1", make_signal(), NOW)
    repo.add(imp)
    fetched = repo.get("imp-1")
    assert fetched is not None
    assert fetched.status is ImprovementStatus.DETECTED
    assert fetched is not imp  # must not leak the same mutable object
    assert repo.get("missing") is None


def test_add_twice_is_a_conflict(repo):
    repo.add(Improvement.detect("imp-1", make_signal(), NOW))
    with pytest.raises(ConflictError):
        repo.add(Improvement.detect("imp-1", make_signal(), NOW))


def test_pending_events_are_not_persisted_as_aggregate_state(repo):
    # Events are transient: the Recorder publishes them after saving (a Postgres adapter writes them to the
    # outbox, T-07). A reloaded aggregate that still carried them would publish them again on its next commit.
    imp = Improvement.detect("imp-1", make_signal(), NOW)
    repo.add(imp)
    assert repo.get("imp-1").pending_events == []

    loaded = repo.get("imp-1")
    loaded.start_investigation(NOW)
    repo.save(loaded)
    assert repo.get("imp-1").pending_events == []
    assert loaded.pending_events, "saving must not consume the caller's events; the Recorder publishes them"


def test_save_rejects_stale_version(repo):
    imp = Improvement.detect("imp-1", make_signal(), NOW)
    repo.add(imp)
    a, b = repo.get("imp-1"), repo.get("imp-1")
    a.start_investigation(NOW)
    repo.save(a)
    with pytest.raises(ConflictError):
        b.start_investigation(NOW)
        repo.save(b)  # b's version is now stale
    assert repo.get("imp-1").version == a.version == 1  # the stale save wrote nothing


def test_save_of_an_unknown_improvement_is_a_conflict(repo):
    with pytest.raises(ConflictError):
        repo.save(Improvement.detect("never-added", make_signal(), NOW))


def test_saves_advance_the_version_and_keep_state(repo):
    imp = Improvement.detect("imp-1", make_signal(), NOW)
    repo.add(imp)
    loaded = repo.get("imp-1")
    loaded.start_investigation(NOW + timedelta(minutes=1))
    loaded.human_notes.append("check the photos")
    repo.save(loaded)
    repo.save(loaded)  # the caller's version follows each save
    again = repo.get("imp-1")
    assert (again.version, again.status, again.human_notes) == (2, ImprovementStatus.INVESTIGATING,
                                                                ["check the photos"])


def test_list_by_status_filters(repo):
    imp = Improvement.detect("imp-1", make_signal(), NOW)
    repo.add(imp)
    assert [i.id for i in repo.list_by_status([ImprovementStatus.DETECTED])] == ["imp-1"]
    assert repo.list_by_status([ImprovementStatus.CLOSED]) == []


def test_list_recent_is_newest_first(repo):
    for n in range(3):
        repo.add(Improvement.detect(f"imp-{n}", make_signal(skus=(f"S{n}",)), NOW + timedelta(minutes=n)))
    assert [i.id for i in repo.list_recent(2)] == ["imp-2", "imp-1"]


def test_find_by_question_id(repo):
    from ci_agent.domain.models.finding import Finding
    from ci_agent.domain.models.human import Question

    imp = Improvement.detect("imp-1", make_signal(), NOW)
    repo.add(imp)
    loaded = repo.get("imp-1")
    loaded.start_investigation(NOW)
    option = make_option()
    loaded.record_finding(Finding("sig-1", "s", (), (), (), (option,), True, 0.5), NOW)
    loaded.open_question(Question("q-1", "imp-1", "p", "c", (option,), NOW, NOW + timedelta(days=2)), NOW)
    repo.save(loaded)
    assert repo.find_by_question_id("q-1").id == "imp-1"
    assert repo.find_by_question_id("q-2") is None


def test_find_by_fingerprint_since_respects_cooldown(repo):
    imp = Improvement.detect("imp-1", make_signal(), NOW)
    repo.add(imp)
    found = repo.find_by_fingerprint_since(imp.signal.fingerprint, NOW - timedelta(hours=1))
    assert found is not None and found.id == "imp-1"
    assert repo.find_by_fingerprint_since("other:fingerprint", NOW - timedelta(hours=1)) is None
