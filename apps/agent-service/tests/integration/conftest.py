"""`-m db` tests: a real Postgres with pgvector (scripts/dev/pg-local.sh, or the compose `db` service)."""

from __future__ import annotations

import os

import pytest


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        pytest.fail(f"{name} is not set: start a database with scripts/dev/pg-local.sh")
    return value
