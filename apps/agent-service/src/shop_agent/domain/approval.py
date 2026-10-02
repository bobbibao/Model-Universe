"""Approval grants: the proof that a person approved the exact write the agent sends (ADR-0011).

The web gateway signs a grant when an admin approves or edits; the web Agent API verifies it on every `shop_change`
write. This module holds the parts both sides must agree on byte for byte: the canonical JSON, the request hash
(identical to the web's `hashAgentRequest`, pinned by packages/contracts/test-vectors/hash/), the claims, and the
check of one request against a grant. Signing and signature verification live outside the domain.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Mapping, Sequence
from typing import Any, Literal

from pydantic import BaseModel, Field

GRANT_TYPE = "approval"
# Floats outside this range format differently in Python and JavaScript; request bodies never need them.
_FLOAT_MIN, _FLOAT_MAX = 1e-6, 1e21
# JavaScript numbers are doubles: integers beyond this lose precision on the web side.
_MAX_SAFE_INTEGER = 2**53 - 1


def canonical_json(value: Any) -> str:
    """JSON with object keys sorted at every level, formatted exactly like the web's `canonicalJson`."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        if abs(value) > _MAX_SAFE_INTEGER:
            raise ValueError(f"integer {value} is beyond JavaScript's safe range")
        return str(value)
    if isinstance(value, float):
        return _canonical_float(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, Mapping):
        items = sorted(value.items(), key=lambda item: str(item[0]))
        return "{" + ",".join(f"{json.dumps(str(k), ensure_ascii=False)}:{canonical_json(v)}" for k, v in items) + "}"
    if isinstance(value, Sequence):
        return "[" + ",".join(canonical_json(item) for item in value) + "]"
    raise TypeError(f"cannot canonicalize {type(value).__name__}")


def _canonical_float(value: float) -> str:
    if not math.isfinite(value):
        raise ValueError("request bodies cannot contain NaN or infinity")
    if value != 0 and not _FLOAT_MIN <= abs(value) < _FLOAT_MAX:
        raise ValueError(f"float {value!r} is outside the range both languages format identically")
    if value.is_integer():
        return str(int(value))  # JavaScript prints 20.0 as 20
    return repr(value)


def request_hash(endpoint: str, body: Mapping[str, Any]) -> str:
    """sha256 of `endpoint + "\\n" + canonical_json(body)`, as the web stores it for idempotency and grants."""
    return hashlib.sha256(f"{endpoint}\n{canonical_json(body)}".encode()).hexdigest()


class GrantAction(BaseModel):
    action_id: str
    endpoint: str
    idempotency_key: str
    body_hash: str


class ApprovalGrant(BaseModel):
    """The claims of an approval grant (a JWT signed by the web with AGENT_APPROVAL_SECRET)."""

    typ: Literal["approval"] = "approval"
    jti: str
    sub: str = Field(description="the approver's web user id")
    thread_id: str
    option_id: str | None = None
    tool_call_ids: list[str] | None = None
    actions: list[GrantAction]
    iat: int
    exp: int


CLOCK_LEEWAY_S = 10


def grant_violation(
    grant: ApprovalGrant,
    *,
    action_id: str,
    endpoint: str,
    idempotency_key: str,
    body: Mapping[str, Any],
    now: int,
) -> str | None:
    """Why this request is not covered by the grant, or None when it is. Signature checks happen before this."""
    if grant.typ != GRANT_TYPE:
        return "not an approval grant"
    if now >= grant.exp:
        return "grant expired"
    if grant.iat > now + CLOCK_LEEWAY_S:
        return "grant issued in the future"
    action = next((a for a in grant.actions if a.action_id == action_id), None)
    if action is None:
        return f"action {action_id} is not in the grant"
    if action.endpoint != endpoint:
        return f"grant covers {action.endpoint}, not {endpoint}"
    if action.idempotency_key != idempotency_key:
        return "idempotency key differs from the approved one"
    if action.body_hash != request_hash(endpoint, body):
        return "body differs from the approved one"
    return None
