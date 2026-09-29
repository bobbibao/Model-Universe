"""A contract every ImprovementRepository implementation must satisfy.

Currently runs only against the in-memory adapter. Once PostgresImprovementRepository is
implemented (docs/ROADMAP.md T-02), parametrize `repo` with a Postgres-backed fixture
(testcontainers) so the same tests protect both implementations.
"""
from datetime import timedelta

import pytest

from ci_agent.application.errors import ConflictError
from ci_agent.domain.models.improvement import Improvement, ImprovementStatus
from ci_agent.infrastructure.persistence.in_memory import InMemoryImprovementRepository
from tests.support.factories import NOW, make_signal


@pytest.fixture(params=["in_memory"])
def repo(request):
    if request.param == "in_memory":
        return InMemoryImprovementRepository()
    raise NotImplementedError(request.param)


def test_add_then_get_round_trips(repo):
    imp = Improvement.detect("imp-1", make_signal(), NOW)
    repo.add(imp)
    fetched = repo.get("imp-1")
    assert fetched is not None
    assert fetched.status is ImprovementStatus.DETECTED
    assert fetched is not imp  # must not leak the same mutable object


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


def test_list_by_status_filters(repo):
    imp = Improvement.detect("imp-1", make_signal(), NOW)
    repo.add(imp)
    assert [i.id for i in repo.list_by_status([ImprovementStatus.DETECTED])] == ["imp-1"]
    assert repo.list_by_status([ImprovementStatus.CLOSED]) == []


def test_find_by_fingerprint_since_respects_cooldown(repo):
    imp = Improvement.detect("imp-1", make_signal(), NOW)
    repo.add(imp)
    found = repo.find_by_fingerprint_since(imp.signal.fingerprint, NOW - timedelta(hours=1))
    assert found is not None and found.id == "imp-1"
