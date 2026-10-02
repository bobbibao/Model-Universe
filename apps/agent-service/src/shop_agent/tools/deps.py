"""How tools find their dependencies.

A run can carry them as its LangGraph context (`ToolRuntime.context` is a `ShopDeps`: tests, in-process runs). Runs
started on the Agent Server by the console, the copilot or a cron carry none; tools then use the provider that each
graph module registers at import (`configure(wiring.default_deps)`), so no tool imports the wiring. The provider is
async because opening the knowledge base reads the database.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from langchain.tools import ToolRuntime
from langchain_core.vectorstores import VectorStore

from shop_agent.adapters.analytics_sql import AnalyticsSql
from shop_agent.domain.policies.autonomy import AutonomySettings
from shop_agent.domain.policies.limits import Limits
from shop_agent.domain.ports import ShopReader, ShopWriter


def utc_now() -> datetime:
    return datetime.now(UTC)


@dataclass
class ShopDeps:
    reader: ShopReader
    writer: ShopWriter
    documents: VectorStore | None = None  # kb_documents: SOPs, policies, brand material
    catalog: VectorStore | None = None  # kb_catalog: products
    analytics: AnalyticsSql | None = None  # exploratory SQL over the analytics views (the analyst subagent)
    limits: Limits = field(default_factory=Limits)
    autonomy: AutonomySettings = field(default_factory=AutonomySettings)
    clock: Callable[[], datetime] = utc_now
    model_profile: str = ""


# The runtime every shop tool receives. Its context is a ShopDeps, or None when the run carries none; it is typed Any
# because pydantic builds the tool's argument schema from it and cannot describe the ports inside ShopDeps.
ShopToolRuntime = ToolRuntime[Any]

Provider = Callable[[], Awaitable[ShopDeps]]
_provider: Provider | None = None


def configure(provider: Provider) -> None:
    global _provider
    _provider = provider


async def get_deps(runtime: Any = None) -> ShopDeps:
    context = getattr(runtime, "context", None) if runtime is not None else None
    if isinstance(context, ShopDeps):
        return context
    if _provider is None:
        raise RuntimeError("no ShopDeps: pass them as the run context or register a provider with deps.configure")
    return await _provider()
