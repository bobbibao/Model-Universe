"""The only two ports the agent owns (docs/ARCHITECTURE.md section 7): reading the shop and writing to it.

Everything else (models, vector store, checkpointer, store) already has an interface in LangChain/LangGraph.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol

from shop_agent.domain.actions import ActionSpec
from shop_agent.domain.growth.snapshot import GrowthSnapshot
from shop_agent.domain.shop import ShopSnapshot


@dataclass(frozen=True)
class ActionResult:
    ok: bool
    ref: str | None = None
    detail: str = ""
    status_code: int | None = None
    error_code: str | None = None
    retryable: bool = False


class ShopReader(Protocol):
    async def snapshot(self, now: datetime) -> ShopSnapshot: ...

    async def kpis(self, names: Sequence[str], now: datetime) -> dict[str, float]: ...

    async def growth_snapshot(self, now: datetime) -> GrowthSnapshot:
        """Sales, catalog, promotions, marketing, market data and the owner's settings (the growth views)."""
        ...


class ShopWriter(Protocol):
    async def execute(
        self, action: ActionSpec, *, grant: str | None = None, context: Mapping[str, Any] | None = None
    ) -> ActionResult:
        """POST the action's body to its endpoint with its idempotency key (and the approval grant, if any)."""
        ...

    async def revert(
        self, of_key: str, *, idempotency_key: str, context: Mapping[str, Any] | None = None
    ) -> ActionResult:
        """Compensate the action sent with `of_key` (the web stores its undo)."""
        ...

    async def ingest(self, endpoint: str, body: Mapping[str, Any], *, idempotency_key: str) -> ActionResult:
        """POST data the agent collected (ingestion class: no grant, nothing to revert), once per key."""
        ...
