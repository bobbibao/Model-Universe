from __future__ import annotations

import time

import jwt
import pytest

from shop_agent.adapters.grant_tokens import build_grant, sign_grant, verify_grant
from shop_agent.domain.approval import canonical_json, grant_violation

BODY = {"skus": ["A"], "percent": 20, "duration_days": 7}
SECRET = "s" * 40


def test_integral_floats_format_like_javascript() -> None:
    assert canonical_json({"percent": 20.0}) == '{"percent":20}'
    assert canonical_json({"zero": 0.0}) == '{"zero":0}'
    assert canonical_json({"percent": 12.5}) == '{"percent":12.5}'


@pytest.mark.parametrize("value", [float("nan"), float("inf"), 1e22, 1e-7, 2**53])
def test_unportable_floats_are_refused(value: float) -> None:
    with pytest.raises(ValueError):
        canonical_json({"x": value})


def grant(now: int, ttl: int = 3600):
    return build_grant(
        approver="7",
        thread_id="t-1",
        option_id="discount",
        actions=[("a0", "pricing/discounts", "t-1:discount:0", BODY)],
        now=now,
        ttl_seconds=ttl,
    )


def test_grant_covers_the_exact_request() -> None:
    now = int(time.time())
    g = grant(now)
    ok = grant_violation(
        g, action_id="a0", endpoint="pricing/discounts", idempotency_key="t-1:discount:0", body=BODY, now=now
    )
    assert ok is None


@pytest.mark.parametrize(
    ("change", "reason"),
    [
        ({"action_id": "a9"}, "not in the grant"),
        ({"endpoint": "tasks"}, "not tasks"),
        ({"idempotency_key": "t-1:discount:0:retry"}, "idempotency key"),
        ({"body": {**BODY, "percent": 50}}, "body differs"),
    ],
)
def test_grant_rejects_anything_else(change: dict[str, object], reason: str) -> None:
    now = int(time.time())
    request: dict[str, object] = {
        "action_id": "a0",
        "endpoint": "pricing/discounts",
        "idempotency_key": "t-1:discount:0",
        "body": BODY,
    }
    request.update(change)
    violation = grant_violation(grant(now), now=now, **request)  # type: ignore[arg-type]
    assert violation is not None and reason in violation


def test_expired_grant() -> None:
    now = int(time.time())
    violation = grant_violation(
        grant(now, ttl=10),
        action_id="a0",
        endpoint="pricing/discounts",
        idempotency_key="t-1:discount:0",
        body=BODY,
        now=now + 11,
    )
    assert violation == "grant expired"


def test_token_round_trip_and_tampering() -> None:
    token = sign_grant(grant(int(time.time())), SECRET)
    assert verify_grant(token, SECRET).thread_id == "t-1"
    with pytest.raises(jwt.InvalidSignatureError):
        verify_grant(token, "x" * 40)
    with pytest.raises(jwt.ExpiredSignatureError):
        verify_grant(sign_grant(grant(int(time.time()) - 7200, ttl=10), SECRET), SECRET)
