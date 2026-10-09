"""`-m db` tests: a real Postgres with pgvector (scripts/dev/pg-local.sh, or the compose `db` service)."""

from __future__ import annotations

import asyncio
import os
import sys
from collections.abc import Callable

import pytest


def pytest_asyncio_loop_factories() -> dict[str, Callable[[], asyncio.AbstractEventLoop]] | None:
    """Psycopg async connections require a selector loop on Windows."""
    return {"psycopg": asyncio.SelectorEventLoop} if sys.platform == "win32" else None


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        pytest.fail(f"{name} is not set: start a database with scripts/dev/pg-local.sh")
    return value
