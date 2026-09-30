"""Postgres adapters for case memory, the audit log, the notification log and the paid-LLM spend (ROADMAP T-02).

Each behaves like its in-memory counterpart (same ordering, same search), checked by
tests/contract/test_store_contracts.py against both.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from psycopg.types.json import Jsonb

from ci_agent.domain.models.audit import AuditEntry
from ci_agent.domain.models.case import CaseRecord
from ci_agent.domain.models.notification import DeliveryAttempt
from ci_agent.infrastructure.persistence.case_search import rank_similar
from ci_agent.infrastructure.persistence.postgres.database import Database
from ci_agent.infrastructure.persistence.postgres.serialization import (
    attempt_from_row,
    audit_from_row,
    case_from_dict,
    case_to_dict,
)


class PostgresCaseMemory:
    def __init__(self, database: Database) -> None:
        self._db = database

    def add(self, case: CaseRecord) -> None:
        with self._db.transaction() as conn:
            conn.execute("INSERT INTO ci.cases (id, improvement_id, signal_kind, payload, created_at) "
                         "VALUES (%s, %s, %s, %s, %s)",
                         (case.id, case.improvement_id, case.signal_kind, Jsonb(case_to_dict(case)), case.created_at))

    def list_recent(self, limit: int = 50) -> list[CaseRecord]:
        with self._db.transaction() as conn:
            rows = conn.execute("SELECT payload FROM ci.cases ORDER BY seq DESC LIMIT %s", (limit,)).fetchall()
        return [case_from_dict(r["payload"]) for r in rows]

    def search_similar(self, text: str, signal_kind: str | None = None, limit: int = 3) -> list[CaseRecord]:
        # Keyword overlap is scored in Python, as in memory, over the cases of that kind (T-06: vector search).
        with self._db.transaction() as conn:
            if signal_kind:
                rows = conn.execute("SELECT payload FROM ci.cases WHERE signal_kind = %s ORDER BY seq",
                                    (signal_kind,)).fetchall()
            else:
                rows = conn.execute("SELECT payload FROM ci.cases ORDER BY seq").fetchall()
        return rank_similar((case_from_dict(r["payload"]) for r in rows), text, signal_kind, limit)


class PostgresAuditLog:
    def __init__(self, database: Database) -> None:
        self._db = database

    def append(self, entry: AuditEntry) -> None:
        with self._db.transaction() as conn:
            conn.execute("INSERT INTO ci.audit_log (improvement_id, actor, action, detail, at) VALUES (%s, %s, %s, %s, %s)",
                         (entry.improvement_id, entry.actor, entry.action, Jsonb(entry.detail), entry.at))

    def list(self, improvement_id: str | None = None, limit: int = 100) -> list[AuditEntry]:
        """The last `limit` entries, oldest first (as in memory)."""
        with self._db.transaction() as conn:
            if improvement_id is None:
                rows = conn.execute("SELECT * FROM ci.audit_log ORDER BY id DESC LIMIT %s", (limit,)).fetchall()
            else:
                rows = conn.execute("SELECT * FROM ci.audit_log WHERE improvement_id = %s ORDER BY id DESC LIMIT %s",
                                    (improvement_id, limit)).fetchall()
        return [audit_from_row(r) for r in reversed(rows)]


class PostgresNotificationLog:
    def __init__(self, database: Database) -> None:
        self._db = database

    def record(self, attempt: DeliveryAttempt) -> None:
        with self._db.transaction() as conn:
            conn.execute("INSERT INTO ci.notification_log (notification_id, channel, ok, detail, attempted_at) "
                         "VALUES (%s, %s, %s, %s, %s)",
                         (attempt.notification_id, attempt.channel.value, attempt.ok, attempt.detail,
                          attempt.attempted_at))

    def list_for(self, notification_id: str) -> list[DeliveryAttempt]:
        with self._db.transaction() as conn:
            rows = conn.execute("SELECT * FROM ci.notification_log WHERE notification_id = %s ORDER BY id",
                                (notification_id,)).fetchall()
        return [attempt_from_row(r) for r in rows]

    def list_recent(self, limit: int = 100) -> list[DeliveryAttempt]:
        with self._db.transaction() as conn:
            rows = conn.execute("SELECT * FROM ci.notification_log ORDER BY id DESC LIMIT %s", (limit,)).fetchall()
        return [attempt_from_row(r) for r in reversed(rows)]


class PostgresLlmSpend:
    """USD spent on a paid LLM per UTC day (the reasoner's daily budget), kept across restarts."""

    def __init__(self, database: Database) -> None:
        self._db = database

    def spent_usd(self, day: date) -> float:
        with self._db.transaction() as conn:
            row = conn.execute("SELECT usd FROM ci.llm_spend WHERE day = %s", (day,)).fetchone()
        return float(row["usd"]) if row else 0.0

    def add_usd(self, day: date, usd: float) -> None:
        with self._db.transaction() as conn:
            conn.execute("INSERT INTO ci.llm_spend (day, usd) VALUES (%s, %s) "
                         "ON CONFLICT (day) DO UPDATE SET usd = ci.llm_spend.usd + EXCLUDED.usd",
                         (day, Decimal(str(usd))))
