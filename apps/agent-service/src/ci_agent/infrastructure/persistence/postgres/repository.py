"""PostgresImprovementRepository (TO IMPLEMENT - docs/ROADMAP.md T-02).

Requirements:
- Implement every method of application.ports.repositories.ImprovementRepository.
- Serialise the aggregate to JSONB (write explicit to_dict/from_dict in infrastructure, not in the domain).
- `save` must use optimistic locking on `version` and raise ConflictError when it is stale.
- Maintain `status`, `fingerprint`, `question_ids` columns on every write.
- Must pass tests/contract/test_repository_contract.py (run it against a real Postgres via testcontainers).
- Write events to ci.event_outbox in the same transaction (T-07).
Schema: schema.sql in this folder.
"""
from __future__ import annotations


class PostgresImprovementRepository:
    def __init__(self, dsn: str) -> None:
        raise NotImplementedError("ROADMAP T-02")
