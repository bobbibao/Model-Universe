"""Who is calling the agent's HTTP API (docs/ROADMAP.md T-04).

Web users never talk to this service directly: the web app's admin proxy (/api/admin/ci/*) mints a
short-lived HS256 "actor" JWT for the signed-in user on every request and sends it as a bearer token.
It is signed with AGENT_ACTOR_SECRET, which is deliberately NOT the web's session secret, so this
service can verify who is acting but can never forge a web session.

Claims: iss=<agent_actor_issuer>, aud=<agent_actor_audience>, typ="ci_actor", sub=<web user id>,
ci_role=staff|manager|owner, iat, exp (lifetime at most MAX_TOKEN_LIFETIME_SECONDS).

Channel webhooks (Telegram, Zalo) authenticate with their own secrets in interfaces/webhooks/*.
"""
from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

import jwt
from fastapi import Depends, Header, HTTPException

from ci_agent.application.use_cases.submit_answer import Actor
from ci_agent.bootstrap.container import Container
from ci_agent.config.settings import Settings
from ci_agent.domain.models.notification import Role, role_at_least
from ci_agent.interfaces.http.dependencies import get_container

ACTOR_TOKEN_TYPE = "ci_actor"
MAX_TOKEN_LIFETIME_SECONDS = 300
CLOCK_LEEWAY_SECONDS = 10
_ALGORITHM = "HS256"


class InvalidActorToken(Exception):
    """The bearer token is missing, malformed, expired, or not an actor token for this service."""


def decode_actor_token(token: str, settings: Settings) -> Actor:
    try:
        claims: dict[str, Any] = jwt.decode(
            token, settings.agent_actor_secret, algorithms=[_ALGORITHM],
            audience=settings.agent_actor_audience, issuer=settings.agent_actor_issuer,
            leeway=CLOCK_LEEWAY_SECONDS, options={"require": ["exp", "iat", "sub", "aud", "iss"]})
    except jwt.PyJWTError as exc:
        raise InvalidActorToken(str(exc)) from exc
    if claims.get("typ") != ACTOR_TOKEN_TYPE:
        raise InvalidActorToken("not an actor token")
    if int(claims["exp"]) - int(claims["iat"]) > MAX_TOKEN_LIFETIME_SECONDS:
        raise InvalidActorToken("token lifetime is too long")
    try:
        role = Role(claims.get("ci_role"))
    except ValueError as exc:
        raise InvalidActorToken("unknown ci_role") from exc
    user_id = str(claims["sub"]).strip()
    if not user_id:
        raise InvalidActorToken("empty subject")
    return Actor(user_id=user_id, role=role, channel="web")


def mint_actor_token(user_id: str, role: Role, settings: Settings, now: datetime, ttl_seconds: int = 60) -> str:
    """Same token the web proxy mints. Used by the `mint-actor` CLI command and by tests."""
    claims = {"iss": settings.agent_actor_issuer, "aud": settings.agent_actor_audience, "typ": ACTOR_TOKEN_TYPE,
              "sub": user_id, "ci_role": role.value, "iat": now, "exp": now + timedelta(seconds=ttl_seconds)}
    return jwt.encode(claims, settings.agent_actor_secret, algorithm=_ALGORITHM)


def current_actor(authorization: str = Header(default=""), container: Container = Depends(get_container)) -> Actor:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "Missing bearer token", headers={"WWW-Authenticate": "Bearer"})
    try:
        return decode_actor_token(token.strip(), container.settings)
    except InvalidActorToken as exc:
        # The reason stays server-side; callers only learn that the token was rejected.
        raise HTTPException(401, "Invalid or expired token", headers={"WWW-Authenticate": "Bearer"}) from exc


def require_role(minimum: Role) -> Callable[..., Actor]:
    def dependency(actor: Actor = Depends(current_actor)) -> Actor:
        if not role_at_least(actor.role, minimum):
            raise HTTPException(403, f"Role {minimum.value!r} or higher required")
        return actor
    return dependency
