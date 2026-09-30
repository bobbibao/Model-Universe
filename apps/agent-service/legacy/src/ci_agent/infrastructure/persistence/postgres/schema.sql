-- The agent's own state, in schema `ci` of its own database (created once by infra/sql/ci_agent.sql). The web shop's
-- database is never written by the agent (ADR-0002).
--
-- Applied by the agent at every startup (infrastructure/persistence/postgres/database.py); every statement is
-- idempotent. Any change here must bump SCHEMA_VERSION in database.py and come with a migration for existing
-- databases: the agent refuses to start against a different version.
CREATE SCHEMA IF NOT EXISTS ci;

CREATE TABLE IF NOT EXISTS ci.schema_version (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    version   INTEGER NOT NULL
);

-- The Improvement aggregate as JSONB (serialization.py), with the columns the repository queries.
CREATE TABLE IF NOT EXISTS ci.improvements (
    id           TEXT PRIMARY KEY,
    status       TEXT NOT NULL,
    fingerprint  TEXT NOT NULL,
    question_ids TEXT[] NOT NULL DEFAULT '{}',
    payload      JSONB NOT NULL,
    version      INTEGER NOT NULL DEFAULT 0,  -- optimistic locking: UPDATE ... WHERE version = :expected
    created_at   TIMESTAMPTZ NOT NULL,        -- the aggregate's own timestamps (domain clock), not now()
    updated_at   TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS improvements_status_idx ON ci.improvements (status);
CREATE INDEX IF NOT EXISTS improvements_fingerprint_idx ON ci.improvements (fingerprint);
CREATE INDEX IF NOT EXISTS improvements_question_ids_idx ON ci.improvements USING GIN (question_ids);
CREATE INDEX IF NOT EXISTS improvements_updated_at_idx ON ci.improvements (updated_at DESC);

-- Case memory. Keyword search for now; ROADMAP T-06 adds an embedding column (pgvector) for semantic search.
CREATE TABLE IF NOT EXISTS ci.cases (
    seq            BIGSERIAL UNIQUE,          -- insertion order (newest first in listings, ties in search)
    id             TEXT PRIMARY KEY,
    improvement_id TEXT NOT NULL,
    signal_kind    TEXT NOT NULL,
    payload        JSONB NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS cases_signal_kind_idx ON ci.cases (signal_kind, seq);

CREATE TABLE IF NOT EXISTS ci.audit_log (
    id             BIGSERIAL PRIMARY KEY,
    improvement_id TEXT,
    actor          TEXT NOT NULL,
    action         TEXT NOT NULL,
    detail         JSONB NOT NULL DEFAULT '{}',
    at             TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_improvement_idx ON ci.audit_log (improvement_id, id);

CREATE TABLE IF NOT EXISTS ci.notification_log (
    id              BIGSERIAL PRIMARY KEY,
    notification_id TEXT NOT NULL,
    channel         TEXT NOT NULL,
    ok              BOOLEAN NOT NULL,
    detail          TEXT NOT NULL DEFAULT '',
    attempted_at    TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS notification_log_notification_idx ON ci.notification_log (notification_id, id);

-- USD spent on a paid LLM per UTC day (LLM_DAILY_BUDGET_USD, docs/adr/0008), so a restart does not reset it.
CREATE TABLE IF NOT EXISTS ci.llm_spend (
    day DATE PRIMARY KEY,
    usd NUMERIC(14, 6) NOT NULL DEFAULT 0
);
