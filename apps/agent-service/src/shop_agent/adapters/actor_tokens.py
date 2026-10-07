"""Actor tokens: who is calling the Agent Server (packages/contracts/test-vectors/actor-token.json).

The web gateway signs one per request for the signed-in admin; the agent signs `system` tokens for its own calls
(the in-server loopback client, `sync-crons`, Claude Code's MCP entry). HS256 with AGENT_ACTOR_SECRET, never the web's
session secret. Times are checked against the caller's clock, so the contract's vectors verify at a fixed time.
"""

from __future__ import annotations

import time
from typing import Literal, get_args

import jwt
from pydantic import BaseModel

ALGORITHM = "HS256"
TOKEN_TYPE = "agent_actor"  # noqa: S105 - a claim value, not a secret
MAX_TTL_SECONDS = 300
LEEWAY_SECONDS = 10
AgentRole = Literal["staff", "manager", "owner", "system", "customer"]
ROLES: tuple[str, ...] = get_args(AgentRole)
SYSTEM_SUBJECT = "system"


class ActorClaims(BaseModel):
    sub: str
    role: AgentRole
    typ: Literal["agent_actor"]
    iss: str
    aud: str
    iat: int
    exp: int


class InvalidActorToken(ValueError):
    pass


def mint_actor_token(
    *,
    subject: str,
    role: AgentRole,
    secret: str,
    issuer: str,
    audience: str,
    ttl_seconds: int = MAX_TTL_SECONDS,
    now: int | None = None,
) -> str:
    if not 0 < ttl_seconds <= MAX_TTL_SECONDS:
        raise ValueError(f"an actor token lives at most {MAX_TTL_SECONDS} seconds")
    issued = int(time.time()) if now is None else now
    claims = {"typ": TOKEN_TYPE, "role": role, "iss": issuer, "aud": audience, "sub": subject}
    return jwt.encode({**claims, "iat": issued, "exp": issued + ttl_seconds}, secret, algorithm=ALGORITHM)


def verify_actor_token(token: str, *, secret: str, issuer: str, audience: str, now: int | None = None) -> ActorClaims:
    at = int(time.time()) if now is None else now
    try:
        raw = jwt.decode(
            token,
            secret,
            algorithms=[ALGORITHM],
            audience=audience,
            issuer=issuer,
            options={"require": ["exp", "iat", "sub", "iss", "aud"], "verify_exp": False, "verify_iat": False},
        )
    except jwt.PyJWTError as exc:
        raise InvalidActorToken(str(exc)) from exc
    if raw.get("typ") != TOKEN_TYPE:
        raise InvalidActorToken("not an actor token")
    if raw.get("role") not in ROLES:
        raise InvalidActorToken("unknown role")
    claims = ActorClaims.model_validate(raw)
    if claims.exp - claims.iat > MAX_TTL_SECONDS:
        raise InvalidActorToken("token lives too long")
    if at > claims.exp + LEEWAY_SECONDS:
        raise InvalidActorToken("token expired")
    if claims.iat > at + LEEWAY_SECONDS:
        raise InvalidActorToken("token issued in the future")
    return claims
