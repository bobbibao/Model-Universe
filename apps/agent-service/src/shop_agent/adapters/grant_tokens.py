"""Approval grant tokens (ADR-0011): HS256 JWTs over `ApprovalGrant` claims.

In production only the web signs grants (AGENT_APPROVAL_SECRET never reaches the agent) and only the web verifies them;
the agent forwards the token it received with the decision. The in-process FakeShop verifies them the same way, and
tests and `simulate` sign them with a test secret.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable, Mapping
from typing import Any

import jwt

from shop_agent.domain.approval import ApprovalGrant, GrantAction, request_hash

ALGORITHM = "HS256"


def sign_grant(grant: ApprovalGrant, secret: str) -> str:
    return jwt.encode(grant.model_dump(exclude_none=True), secret, algorithm=ALGORITHM)


def verify_grant(token: str, secret: str, *, wall_clock: bool = True) -> ApprovalGrant:
    """Check the signature and, by default, `exp` and `iat` against the wall clock; `grant_violation` checks the rest.

    In-process simulations run on their own clock: they pass `wall_clock=False`, and `grant_violation` compares `exp`
    and `iat` with the simulated time instead.
    """
    claims = jwt.decode(
        token,
        secret,
        algorithms=[ALGORITHM],
        options={"require": ["exp", "iat", "jti", "sub"], "verify_exp": wall_clock, "verify_iat": wall_clock},
    )
    return ApprovalGrant.model_validate(claims)


def build_grant(
    *,
    approver: str,
    thread_id: str,
    actions: Iterable[tuple[str, str, str, Mapping[str, Any]]],
    now: int,
    ttl_seconds: int = 24 * 3600,
    option_id: str | None = None,
    tool_call_ids: list[str] | None = None,
) -> ApprovalGrant:
    """Claims for approving `actions` = (action_id, endpoint, idempotency_key, body) as sent by `act`."""
    return ApprovalGrant(
        jti=str(uuid.uuid4()),
        sub=approver,
        thread_id=thread_id,
        option_id=option_id,
        tool_call_ids=tool_call_ids,
        actions=[
            GrantAction(action_id=a, endpoint=e, idempotency_key=k, body_hash=request_hash(e, b))
            for a, e, k, b in actions
        ],
        iat=now,
        exp=now + ttl_seconds,
    )
