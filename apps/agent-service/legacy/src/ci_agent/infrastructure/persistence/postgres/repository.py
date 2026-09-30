"""PostgresImprovementRepository (ROADMAP T-02): the Improvement aggregate as JSONB in ci.improvements.

- The payload is written by the explicit mapping in serialization.py; `status`, `fingerprint`, `question_ids` and the
  timestamps are columns kept in step on every write, so queries never look inside the payload.
- `save` is optimistic: `UPDATE ... WHERE version = <the version that was read>`; a stale version raises
  ConflictError (409 on decisions, a per-improvement error in a run) and nothing is written.
- Pending domain events are not stored: the Recorder publishes them after the save, best effort, until the
  transactional outbox of ROADMAP T-07.

Behaves exactly like InMemoryImprovementRepository: tests/contract/test_repository_contract.py runs against both.
"""
from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Any

from psycopg.types.json import Jsonb

from ci_agent.application.errors import ConflictError
from ci_agent.domain.models.improvement import Improvement, ImprovementStatus
from ci_agent.infrastructure.persistence.postgres.database import Database
from ci_agent.infrastructure.persistence.postgres.serialization import (
    improvement_from_dict,
    improvement_to_dict,
)

_COLUMNS = "payload, version"


def _load(row: dict[str, Any]) -> Improvement:
    return improvement_from_dict(row["payload"], row["version"])


class PostgresImprovementRepository:
    def __init__(self, database: Database) -> None:
        self._db = database

    def add(self, improvement: Improvement) -> None:
        with self._db.transaction() as conn:
            row = conn.execute(
                "INSERT INTO ci.improvements (id, status, fingerprint, question_ids, payload, version, created_at, "
                "updated_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING RETURNING id",
                (improvement.id, improvement.status.value, improvement.signal.fingerprint,
                 [q.id for q in improvement.questions], Jsonb(improvement_to_dict(improvement)),
                 improvement.version, improvement.created_at, improvement.updated_at)).fetchone()
        if row is None:
            raise ConflictError(f"Improvement {improvement.id} already exists")

    def save(self, improvement: Improvement) -> None:
        with self._db.transaction() as conn:
            row = conn.execute(
                "UPDATE ci.improvements SET status = %s, fingerprint = %s, question_ids = %s, payload = %s, "
                "version = version + 1, updated_at = %s WHERE id = %s AND version = %s RETURNING version",
                (improvement.status.value, improvement.signal.fingerprint, [q.id for q in improvement.questions],
                 Jsonb(improvement_to_dict(improvement)), improvement.updated_at, improvement.id,
                 improvement.version)).fetchone()
            if row is None:
                exists = conn.execute("SELECT 1 FROM ci.improvements WHERE id = %s", (improvement.id,)).fetchone()
                raise ConflictError("Improvement was modified concurrently" if exists
                                    else f"Improvement {improvement.id} does not exist")
        improvement.version = row["version"]

    def get(self, improvement_id: str) -> Improvement | None:
        return self._one(f"SELECT {_COLUMNS} FROM ci.improvements WHERE id = %s", (improvement_id,))

    def find_by_question_id(self, question_id: str) -> Improvement | None:
        return self._one(f"SELECT {_COLUMNS} FROM ci.improvements WHERE question_ids @> ARRAY[%s]::text[] "
                         "ORDER BY created_at, id LIMIT 1", (question_id,))

    def list_by_status(self, statuses: Sequence[ImprovementStatus]) -> list[Improvement]:
        return self._many(f"SELECT {_COLUMNS} FROM ci.improvements WHERE status = ANY(%s) ORDER BY created_at, id",
                          ([s.value for s in statuses],))

    def list_recent(self, limit: int = 50) -> list[Improvement]:
        return self._many(f"SELECT {_COLUMNS} FROM ci.improvements ORDER BY updated_at DESC, id LIMIT %s", (limit,))

    def find_by_fingerprint_since(self, fingerprint: str, since: datetime) -> Improvement | None:
        return self._one(f"SELECT {_COLUMNS} FROM ci.improvements WHERE fingerprint = %s "
                         "AND (status <> %s OR updated_at >= %s) ORDER BY created_at, id LIMIT 1",
                         (fingerprint, ImprovementStatus.CLOSED.value, since))

    def _one(self, query: str, params: tuple[Any, ...]) -> Improvement | None:
        found = self._many(query, params)
        return found[0] if found else None

    def _many(self, query: str, params: tuple[Any, ...]) -> list[Improvement]:
        with self._db.transaction() as conn:
            rows = conn.execute(query.encode("utf-8"), params).fetchall()
        return [_load(row) for row in rows]
