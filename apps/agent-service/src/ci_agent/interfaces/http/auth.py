"""Two kinds of caller: a logged-in user of the web app (JWT from the web session), and the
web app itself calling back with a service token. TO IMPLEMENT - docs/ROADMAP.md T-04."""
from __future__ import annotations

from fastapi import Header, HTTPException

from ci_agent.application.use_cases.submit_answer import Actor
from ci_agent.domain.models.notification import Role


def current_actor(authorization: str = Header(default="")) -> Actor:
    """Decode the web app's JWT (shared secret or JWKS) into an Actor(user_id, role, channel='web').

    Placeholder: accepts `Authorization: Bearer <user_id>:<role>` for local development only.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    try:
        user_id, role = authorization.removeprefix("Bearer ").split(":", 1)
        return Actor(user_id=user_id, role=Role(role), channel="web")
    except ValueError as exc:
        raise HTTPException(401, "Invalid token (expected 'user_id:role' in development mode)") from exc


def require_service_token(expected: str, authorization: str = Header(default="")) -> None:
    if authorization != f"Bearer {expected}":
        raise HTTPException(401, "Invalid service token")
