"""The agent's own Postgres database (ROADMAP T-02): a small connection pool, the schema, and one error type.

DATABASE_URL points at the database created by infra/sql/ci_agent.sql, as the role that owns it. At startup
`Database.open` applies schema.sql (idempotent, under an advisory lock so two starting processes do not race) and
refuses to run against a schema version it does not know.
"""
from __future__ import annotations

import logging
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool, PoolTimeout

logger = logging.getLogger(__name__)

SCHEMA_VERSION = 1
SCHEMA_SQL = Path(__file__).with_name("schema.sql")
_SCHEMA_LOCK = 7_210_002  # pg_advisory_xact_lock key for applying the schema
CONNECT_TIMEOUT_S = 5
POOL_TIMEOUT_S = 10.0
AGENT_APPLICATION_NAME = "ci-agent"  # how a running agent shows up in pg_stat_activity (checked by the reset)
AGENT_TABLES = ("ci.improvements", "ci.cases", "ci.audit_log", "ci.notification_log", "ci.llm_spend")


class PersistenceUnavailable(RuntimeError):
    """The agent's database cannot be reached or used. The HTTP layer answers 503 with this message."""


class Database:
    def __init__(self, pool: ConnectionPool) -> None:
        self._pool = pool

    @classmethod
    def open(cls, dsn: str, max_size: int = 5, application_name: str = AGENT_APPLICATION_NAME) -> Database:
        pool = ConnectionPool(dsn, min_size=1, max_size=max_size, open=False, timeout=POOL_TIMEOUT_S,
                              kwargs={"row_factory": dict_row, "connect_timeout": CONNECT_TIMEOUT_S,
                                      "application_name": application_name},
                              name=application_name)
        try:
            pool.open(wait=True, timeout=POOL_TIMEOUT_S)
        except PoolTimeout as exc:
            pool.close()
            raise PersistenceUnavailable("agent database unreachable (check DATABASE_URL and that the database "
                                         "exists, see infra/sql/ci_agent.sql)") from exc
        database = cls(pool)
        database.apply_schema()
        return database

    def close(self) -> None:
        self._pool.close()

    @contextmanager
    def transaction(self) -> Iterator[psycopg.Connection[Any]]:
        """One connection in one transaction: committed on success, rolled back on any error."""
        try:
            with self._pool.connection() as conn:  # commits, or rolls back if the block raises
                yield conn
        except PoolTimeout as exc:
            raise PersistenceUnavailable("agent database unreachable: no connection within "
                                         f"{POOL_TIMEOUT_S:g}s") from exc
        except psycopg.OperationalError as exc:
            raise PersistenceUnavailable(f"agent database error: {str(exc).strip().splitlines()[0]}") from exc

    def apply_schema(self) -> None:
        with self.transaction() as conn:
            conn.execute("SELECT pg_advisory_xact_lock(%s)", (_SCHEMA_LOCK,))
            conn.execute(SCHEMA_SQL.read_bytes())  # several statements: allowed without parameters
            row = conn.execute("SELECT version FROM ci.schema_version").fetchone()
            if row is None:
                conn.execute("INSERT INTO ci.schema_version (version) VALUES (%s)", (SCHEMA_VERSION,))
            elif row["version"] != SCHEMA_VERSION:
                raise RuntimeError(f"The agent database has schema version {row['version']}; this agent expects "
                                   f"{SCHEMA_VERSION}. Migrate the database before starting this version.")
        logger.info("Agent database ready (schema version %s)", SCHEMA_VERSION)


def reset_agent_data(dsn: str) -> dict[str, int]:
    """Delete every improvement, case, log entry and LLM spend record (e.g. after a web reseed made them stale).

    Refuses while an agent process is connected: it would keep working on improvements that no longer exist. The
    schema (and its version) stays. Returns the number of rows deleted per table.
    """
    with psycopg.connect(dsn, connect_timeout=CONNECT_TIMEOUT_S, autocommit=False) as conn:
        # Lock first, so an agent that starts after the check cannot read or write until the reset is committed.
        conn.execute("SET LOCAL lock_timeout = '5s'")
        try:
            conn.execute(f"LOCK TABLE {', '.join(AGENT_TABLES)} IN ACCESS EXCLUSIVE MODE".encode())
        except psycopg.errors.LockNotAvailable as exc:
            raise RuntimeError("The agent tables are in use (is the agent running?); stop it first.") from exc
        running = conn.execute("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() "
                               "AND application_name = %s AND pid <> pg_backend_pid()",
                               (AGENT_APPLICATION_NAME,)).fetchone()
        if running and running[0]:
            raise RuntimeError(f"The agent is running ({running[0]} connection(s) to this database); stop it first.")
        counts = {table: conn.execute(f"SELECT count(*) FROM {table}".encode()).fetchone()[0]  # type: ignore[index]
                  for table in AGENT_TABLES}
        conn.execute(f"TRUNCATE {', '.join(AGENT_TABLES)} RESTART IDENTITY".encode())
    return counts
