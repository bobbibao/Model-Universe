"""Shared fixtures. The Postgres ones run only against a throwaway database given in AGENT_TEST_DATABASE_URL, e.g.

    AGENT_TEST_DATABASE_URL=postgresql://ci_agent_test:<password>@localhost:5432/ci_agent_test

created with infra/sql/ci_agent.sql (-v agent_role=ci_agent_test -v agent_db=ci_agent_test). The `ci` schema there
is dropped and recreated once per test session, and every table is emptied before each test that uses it.
"""
import os

import pytest

AGENT_TEST_DATABASE_URL = os.environ.get("AGENT_TEST_DATABASE_URL", "")
needs_agent_db = pytest.mark.skipif(not AGENT_TEST_DATABASE_URL, reason="set AGENT_TEST_DATABASE_URL to run")


@pytest.fixture(scope="session")
def agent_database():
    if not AGENT_TEST_DATABASE_URL:
        pytest.skip("set AGENT_TEST_DATABASE_URL to run")
    import psycopg

    from ci_agent.infrastructure.persistence.postgres.database import Database

    with psycopg.connect(AGENT_TEST_DATABASE_URL, autocommit=True) as conn:
        conn.execute("DROP SCHEMA IF EXISTS ci CASCADE")  # also proves the schema applies to an empty database
    database = Database.open(AGENT_TEST_DATABASE_URL, application_name="ci-agent-tests")  # not a running agent
    yield database
    database.close()


@pytest.fixture
def agent_db(agent_database):
    with agent_database.transaction() as conn:
        conn.execute("TRUNCATE ci.improvements, ci.cases, ci.audit_log, ci.notification_log, ci.llm_spend "
                     "RESTART IDENTITY")
    return agent_database
