"""Custom auth for the Agent Server (`langgraph.json` -> `auth`): every request carries an actor token.

- Admins (`staff`, `manager`, `owner`, via the web gateway) read threads, the Store and assistants, run `monitor`
  ("Run now"), resume `improvement` reviews and chat with `assistant`.
- `system` (the agent itself: the loopback client inside `monitor`, `sync-crons`, Claude Code's MCP entry) creates
  threads and runs on `monitor`, `improvement`, `collect` and `assistant` (the daily briefing), manages crons, and
  writes the Store.
- Everything else is denied. The server records the caller's identity in each run's metadata (`created_by`).
A cron's runs are started by the server itself (no actor token) and are authorized as `system`, the only role that
may create crons.
"""

from __future__ import annotations

import uuid
from collections.abc import Mapping
from typing import Any

from langgraph_sdk import Auth

from shop_agent.adapters.actor_tokens import InvalidActorToken, verify_actor_token
from shop_agent.config import get_settings

auth = Auth()

ADMIN_ROLES = frozenset({"staff", "manager", "owner"})
SYSTEM_GRAPHS = frozenset({"monitor", "improvement", "collect", "assistant"})
ADMIN_GRAPHS = frozenset({"monitor", "improvement", "assistant"})
# The Agent Server names a graph's default assistant uuid5(NAMESPACE_GRAPH, graph id) (langgraph_api.graph).
GRAPH_NAMESPACE = uuid.UUID("6ba7b821-9dad-11d1-80b4-00c04fd430c8")


def _unauthorized(detail: str) -> Auth.exceptions.HTTPException:
    return Auth.exceptions.HTTPException(status_code=401, detail=detail)


def _forbidden(detail: str) -> Auth.exceptions.HTTPException:
    return Auth.exceptions.HTTPException(status_code=403, detail=detail)


def header(headers: Mapping[Any, Any], name: str) -> str:
    """A request header, whether the runtime passes bytes (langgraph-api) or str (Aegra) keys and values."""
    for key, value in headers.items():
        text_key = key.decode() if isinstance(key, bytes) else str(key)
        if text_key.lower() == name:
            return value.decode() if isinstance(value, bytes) else str(value)
    return ""


# The handler takes `headers`: langgraph-api injects it by name and Aegra passes it as the first argument.
@auth.authenticate
async def authenticate(headers: Mapping[Any, Any]) -> Auth.types.MinimalUserDict:
    scheme, _, token = header(headers, "authorization").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise _unauthorized("an actor token is required")
    settings = get_settings()
    try:
        claims = verify_actor_token(
            token,
            secret=settings.agent_actor_secret,
            issuer=settings.agent_actor_issuer,
            audience=settings.agent_actor_audience,
        )
    except InvalidActorToken as exc:
        raise _unauthorized(f"invalid actor token: {exc}") from exc
    return {"identity": claims.sub, "display_name": claims.role, "permissions": [f"role:{claims.role}"]}


def _role(ctx: Auth.types.AuthContext) -> str:
    role = next((p.removeprefix("role:") for p in ctx.permissions if p.startswith("role:")), None)
    # Every request that reaches a handler passed `authenticate`, which always grants a `role:` permission. A context
    # without one is the server's own cron scheduler starting a cron's run, and only `system` may create crons.
    return "system" if role is None else role


def graph_of(assistant_id: Any) -> str:
    """The graph name for an assistant id given as a name or as the default assistant's uuid."""
    value = str(assistant_id or "")
    for graph in SYSTEM_GRAPHS | ADMIN_GRAPHS:
        if value in (graph, str(uuid.uuid5(GRAPH_NAMESPACE, graph))):
            return graph
    return value


@auth.on
async def deny_by_default(ctx: Auth.types.AuthContext, value: Any) -> bool:
    raise _forbidden(f"{_role(ctx) or 'this caller'} may not {ctx.action} {ctx.resource}")


@auth.on.threads.create
async def create_thread(ctx: Auth.types.AuthContext, value: Auth.types.ThreadsCreate) -> bool:
    return _role(ctx) == "system" or _role(ctx) in ADMIN_ROLES


@auth.on.threads.read
async def read_thread(ctx: Auth.types.AuthContext, value: Auth.types.ThreadsRead) -> bool:
    return _role(ctx) == "system" or _role(ctx) in ADMIN_ROLES


@auth.on.threads.search
async def search_threads(ctx: Auth.types.AuthContext, value: Auth.types.ThreadsSearch) -> bool:
    return _role(ctx) == "system" or _role(ctx) in ADMIN_ROLES


@auth.on.threads.delete
async def delete_thread(ctx: Auth.types.AuthContext, value: Auth.types.ThreadsDelete) -> bool:
    """The server deletes a stateless run's temporary thread when the run completes, as the run's caller (a cron:
    `system`; "Run now": the admin). People cannot delete threads: the web gateway has no DELETE route."""
    return _role(ctx) == "system" or _role(ctx) in ADMIN_ROLES


@auth.on.threads.create_run
async def create_run(ctx: Auth.types.AuthContext, value: Auth.types.RunsCreate) -> bool:
    role, graph = _role(ctx), graph_of(value.get("assistant_id"))
    allowed = SYSTEM_GRAPHS if role == "system" else ADMIN_GRAPHS if role in ADMIN_ROLES else frozenset()
    if graph not in allowed:
        raise _forbidden(f"{role or 'this caller'} may not run {graph or 'this assistant'}")
    return True


@auth.on.assistants.read
async def read_assistant(ctx: Auth.types.AuthContext, value: Auth.types.AssistantsRead) -> bool:
    return True


@auth.on.assistants.search
async def search_assistants(ctx: Auth.types.AuthContext, value: Auth.types.AssistantsSearch) -> bool:
    return True


@auth.on.crons
async def manage_crons(ctx: Auth.types.AuthContext, value: Any) -> bool:
    if _role(ctx) != "system":
        raise _forbidden("only the system role manages crons")
    return True


@auth.on.store
async def use_store(ctx: Auth.types.AuthContext, value: Any) -> bool:
    role = _role(ctx)
    if role == "system":
        return True
    if role in ADMIN_ROLES and ctx.action in ("get", "search", "list_namespaces"):
        return True
    raise _forbidden(f"{role or 'this caller'} may not {ctx.action} the store")
