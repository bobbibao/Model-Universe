-- Schema `ci`, owned by the agent service (the web app owns schema `shop`).
-- The aggregate is stored as JSONB with indexed columns for querying.
-- Implement PostgresImprovementRepository so it passes tests/contract/test_repository_contract.py.
CREATE SCHEMA IF NOT EXISTS ci;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS ci.improvements (
    id           TEXT PRIMARY KEY,
    status       TEXT NOT NULL,
    fingerprint  TEXT NOT NULL,
    question_ids TEXT[] NOT NULL DEFAULT '{}',
    payload      JSONB NOT NULL,          -- serialised Improvement aggregate
    version      INTEGER NOT NULL DEFAULT 0,  -- optimistic locking: UPDATE ... WHERE version = :expected
    created_at   TIMESTAMPTZ NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS improvements_status_idx ON ci.improvements (status);
CREATE INDEX IF NOT EXISTS improvements_fingerprint_idx ON ci.improvements (fingerprint);
CREATE INDEX IF NOT EXISTS improvements_question_ids_idx ON ci.improvements USING GIN (question_ids);

CREATE TABLE IF NOT EXISTS ci.cases (
    id           TEXT PRIMARY KEY,
    signal_kind  TEXT NOT NULL,
    payload      JSONB NOT NULL,
    embedding    vector(1536),             -- dimension depends on the embedding model
    created_at   TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS ci.audit_log (
    id             BIGSERIAL PRIMARY KEY,
    improvement_id TEXT,
    actor          TEXT NOT NULL,
    action         TEXT NOT NULL,
    detail         JSONB NOT NULL DEFAULT '{}',
    at             TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_improvement_idx ON ci.audit_log (improvement_id, at);

CREATE TABLE IF NOT EXISTS ci.notification_log (
    id              BIGSERIAL PRIMARY KEY,
    notification_id TEXT NOT NULL,
    channel         TEXT NOT NULL,
    ok              BOOLEAN NOT NULL,
    detail          TEXT NOT NULL DEFAULT '',
    attempted_at    TIMESTAMPTZ NOT NULL
);

-- Transactional outbox: events are written in the same transaction as the aggregate,
-- a worker delivers them to the web webhook at-least-once and marks them delivered.
CREATE TABLE IF NOT EXISTS ci.event_outbox (
    id           BIGSERIAL PRIMARY KEY,
    event        JSONB NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON ci.event_outbox (id) WHERE delivered_at IS NULL;
