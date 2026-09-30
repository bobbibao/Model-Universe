"""The agent's database at startup (T-02): the schema applies again harmlessly, a different schema version is
refused, and an unreachable database fails with a message that says what to check."""
import pytest

from ci_agent.infrastructure.persistence.postgres import database as database_module
from ci_agent.infrastructure.persistence.postgres.database import (
    SCHEMA_VERSION,
    Database,
    PersistenceUnavailable,
)
from tests.conftest import AGENT_TEST_DATABASE_URL


def test_the_schema_applies_again_without_touching_data(agent_db):
    with agent_db.transaction() as conn:
        conn.execute("INSERT INTO ci.llm_spend (day, usd) VALUES ('2026-09-29', 1.5)")
    again = Database.open(AGENT_TEST_DATABASE_URL)
    try:
        with again.transaction() as conn:
            assert conn.execute("SELECT usd FROM ci.llm_spend").fetchone()["usd"] == 1.5
            assert conn.execute("SELECT version FROM ci.schema_version").fetchone()["version"] == SCHEMA_VERSION
    finally:
        again.close()


def test_a_different_schema_version_is_refused(agent_db):
    with agent_db.transaction() as conn:
        conn.execute("UPDATE ci.schema_version SET version = %s", (SCHEMA_VERSION + 1,))
    try:
        with pytest.raises(RuntimeError, match=f"schema version {SCHEMA_VERSION + 1}; this agent expects"):
            Database.open(AGENT_TEST_DATABASE_URL)
    finally:
        with agent_db.transaction() as conn:
            conn.execute("UPDATE ci.schema_version SET version = %s", (SCHEMA_VERSION,))


def test_an_unreachable_database_says_what_to_check(monkeypatch):
    monkeypatch.setattr(database_module, "POOL_TIMEOUT_S", 1.0)
    with pytest.raises(PersistenceUnavailable, match="check DATABASE_URL"):
        Database.open("postgresql://ci_agent:x@127.0.0.1:1/ci_agent?connect_timeout=1")
