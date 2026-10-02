"""Test-only approval grants: what the web gateway does when an admin approves, for in-process runs and tests."""

from __future__ import annotations

import os
from collections.abc import Iterable, Mapping
from typing import Any

from shop_agent.adapters.grant_tokens import build_grant, sign_grant
from shop_agent.domain.actions import ActionSpec, apply_edits

TEST_SECRET_ENV = "AGENT_APPROVAL_SECRET_TEST"  # noqa: S105 - an environment variable name
DEFAULT_TEST_SECRET = "test-approval-secret-only-for-tests-and-simulate"  # noqa: S105 - never used in production


def approval_test_secret() -> str:
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
    return sign_grant(grant, approval_test_secret())


def approve_option(
    *,
    thread_id: str,
    option: Mapping[str, Any],
    now: int,
    args: Mapping[str, Any] | None = None,
    approver: str = "test-approver",
) -> str:
    """What the web gateway does for a review decision: apply the edit to the option's actions, then sign them."""
    actions = [ActionSpec.model_validate(a) for a in option["actions"]]
    if args:
        actions = apply_edits(actions, args)
    return approve(
        thread_id=thread_id,
        option_id=str(option["option_id"]),
        actions=[(a.action_id, a.endpoint, a.idempotency_key, a.body) for a in actions],
        now=now,
        approver=approver,
    )
