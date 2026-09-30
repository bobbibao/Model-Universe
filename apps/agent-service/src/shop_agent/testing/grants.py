"""Test-only approval grants: what the web gateway does when an admin approves, for in-process runs and tests."""

from __future__ import annotations

import os
from collections.abc import Iterable, Mapping
from typing import Any

from shop_agent.adapters.grant_tokens import build_grant, sign_grant

TEST_SECRET_ENV = "AGENT_APPROVAL_SECRET_TEST"  # noqa: S105 - an environment variable name
DEFAULT_TEST_SECRET = "test-approval-secret-only-for-tests-and-simulate"  # noqa: S105 - never used in production


def test_secret() -> str:
    return os.environ.get(TEST_SECRET_ENV, DEFAULT_TEST_SECRET)


def approve(
    *,
    thread_id: str,
    actions: Iterable[tuple[str, str, str, Mapping[str, Any]]],
    now: int,
    approver: str = "test-approver",
    option_id: str | None = None,
    tool_call_ids: list[str] | None = None,
    ttl_seconds: int = 24 * 3600,
) -> str:
    grant = build_grant(
        approver=approver,
        thread_id=thread_id,
        actions=actions,
        now=now,
        ttl_seconds=ttl_seconds,
        option_id=option_id,
        tool_call_ids=tool_call_ids,
    )
    return sign_grant(grant, test_secret())
