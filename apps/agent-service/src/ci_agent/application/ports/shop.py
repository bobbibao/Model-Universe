"""Ports to the e-commerce shop. Reads are read-only; writes are idempotent and revertible."""
from __future__ import annotations

from dataclasses import dataclass

from typing import Protocol, Sequence

from ci_agent.domain.models.shop import ShopSnapshot


@dataclass(frozen=True)
class ActionResult:
    ok: bool
    external_ref: str | None = None
    detail: str = ""


class ShopReadPort(Protocol):
    def snapshot(self) -> ShopSnapshot: ...

    def kpis(self, names: Sequence[str]) -> dict[str, float]: ...


class ShopActionPort(Protocol):
    """Every method takes an idempotency_key: the same key must never apply twice."""

    def adjust_inventory(self, *, idempotency_key: str, sku: str, new_status: str, reason: str,
                         dry_run: bool = False) -> ActionResult: ...

    def apply_discount(self, *, idempotency_key: str, skus: list[str], percent: float,
                       duration_days: int, dry_run: bool = False) -> ActionResult: ...

    def create_task(self, *, idempotency_key: str, title: str, assignee_role: str, description: str,
                    due_in_days: int | None = None) -> ActionResult: ...

    def switch_channel(self, *, idempotency_key: str, skus: list[str], to_channel: str,
                       dry_run: bool = False) -> ActionResult: ...

    def update_sop_checklist(self, *, idempotency_key: str, sop_id: str, add_items: list[str]) -> ActionResult: ...

    def revert(self, *, idempotency_key: str, of_key: str) -> ActionResult:
        """Compensate an earlier action identified by its idempotency key."""
        ...



