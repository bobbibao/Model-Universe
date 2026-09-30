"""FakeShop: an in-memory shop implementing ShopReader and ShopWriter, for tests, `simulate` and local development.

It behaves like the web Agent API where it matters: idempotent replay (409 for a key reused with another body),
approval grants (a `shop_change` write needs a valid grant, or its capability in `auto_low` and a low-tier action),
revert, failure injection, and simulated sales (`advance_days`) so Measure sees a before and after.
"""

from __future__ import annotations

import random
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt

from shop_agent.adapters.grant_tokens import verify_grant
from shop_agent.domain.actions import ActionSpec
from shop_agent.domain.approval import grant_violation, request_hash
from shop_agent.domain.capabilities import RiskTier
from shop_agent.domain.kpi_calc import snapshot_kpis
from shop_agent.domain.policies.autonomy import AutonomyMode, AutonomySettings
from shop_agent.domain.policies.tiers import action_tier
from shop_agent.domain.ports import ActionResult
from shop_agent.domain.shop import ReturnRecord, ShopSnapshot, StockItem

Clock = Callable[[], datetime]
Undo = Callable[[], None]


@dataclass
class SentWrite:
    idempotency_key: str
    endpoint: str
    body: dict[str, Any]
    applied: bool
    grant: bool


@dataclass
class _Stored:
    request_hash: str
    result: ActionResult


@dataclass
class FakeShop:
    stock: dict[str, StockItem]
    returns: list[ReturnRecord]
    base_daily: dict[str, float]
    clock: Clock = field(default=lambda: datetime.now(UTC))
    grant_secret: str | None = None  # None: grants are not enforced (local development without the web)
    autonomy: AutonomySettings = field(default_factory=AutonomySettings)

    discounts: dict[str, float] = field(default_factory=dict)
    statuses: dict[str, str] = field(default_factory=dict)
    tasks: list[dict[str, Any]] = field(default_factory=list)
    checklists: dict[str, list[str]] = field(default_factory=dict)
    recovered_vnd: int = 0
    fail_types: set[str] = field(default_factory=set)
    fail_once_types: set[str] = field(default_factory=set)
    sent: list[SentWrite] = field(default_factory=list)
    _sold30: dict[str, int] = field(default_factory=dict)
    _carry: dict[str, float] = field(default_factory=dict)
    _stored: dict[str, _Stored] = field(default_factory=dict)
    _undo: dict[str, Undo] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self._sold30:
            self._sold30 = {s: round(self.base_daily.get(s, 0.0) * 30) for s in self.stock}

    # ------------------------------------------------------------------------------------------------ demo data

    @classmethod
    def seed_demo(
        cls,
        clock: Clock,
        *,
        n_stock: int = 500,
        n_returns: int = 100,
        seed: int = 7,
        grant_secret: str | None = None,
        autonomy: AutonomySettings | None = None,
    ) -> FakeShop:
        rng = random.Random(seed)  # noqa: S311 - simulation data, not security
        categories = ["ao", "quan", "vay", "giay", "phu-kien", "tui"]
        now = clock()
        stock: dict[str, StockItem] = {}
        base: dict[str, float] = {}
        for n in range(n_stock):
            sku, category = f"SKU-{n:04d}", rng.choice(categories)
            cost = rng.randrange(100_000, 1_500_000, 1_000)
            roll = rng.random()
            if roll < 0.12:  # dead stock
                item = StockItem(
                    sku,
                    f"{category} {n}",
                    category,
                    rng.randint(20, 120),
                    cost,
                    int(round(cost * 1.8, -3)),
                    rng.randint(100, 300),
                    condition=rng.choice(["new", "new", "open_box"]),
                )
                base[sku] = round(rng.uniform(0.0, 0.12), 3)
            else:  # healthy
                item = StockItem(
                    sku,
                    f"{category} {n}",
                    category,
                    rng.randint(5, 80),
                    cost,
                    int(round(cost * 1.7, -3)),
                    rng.randint(3, 80),
                )
                base[sku] = round(rng.uniform(0.6, 3.5), 3)
            stock[sku] = item
        healthy = [s for s in stock if base[s] > 1.0]
        problem = rng.sample(healthy, k=min(3, len(healthy)))
        returns: list[ReturnRecord] = []
        reasons = ["not as described", "not as described", "size", "defective", "changed mind"]
        for m in range(n_returns):
            sku = problem[m % len(problem)] if m < n_returns * 0.4 else rng.choice(list(stock))
            returns.append(
                ReturnRecord(
                    f"ORD-{m:05d}",
                    sku,
                    rng.choice(reasons),
                    rng.choice(["new", "open_box", "damaged"]),
                    now - timedelta(days=rng.randint(1, 25)),
                    rng.randrange(200_000, 2_000_000, 1_000),
                )
            )
        for sku in problem:  # low sales, so their return rate is high
            base[sku] = 1.0
        return cls(stock, returns, base, clock, grant_secret, autonomy or AutonomySettings())

    # ------------------------------------------------------------------------------------------------ ShopReader

    def snapshot_now(self, now: datetime | None = None) -> ShopSnapshot:
        return ShopSnapshot(
            taken_at=now or self.clock(),
            stock=tuple(self.stock.values()),
            returns=tuple(self.returns),
            units_sold_30d=dict(self._sold30),
            recovered_vnd=self.recovered_vnd,
        )

    async def snapshot(self, now: datetime) -> ShopSnapshot:
        return self.snapshot_now(now)

    async def kpis(self, names: Sequence[str], now: datetime) -> dict[str, float]:
        values = snapshot_kpis(self.snapshot_now(now))
        return {n: values[n] for n in names if n in values}

    # ------------------------------------------------------------------------------------------------ simulation

    def advance_days(self, days: int) -> None:
        for sku, item in list(self.stock.items()):
            pct = self.discounts.get(sku, 0.0)
            multiplier = 1 + pct / 100 * 40 + (3.0 if item.channel == "outlet" else 0.0)
            self._carry[sku] = self._carry.get(sku, 0.0) + self.base_daily.get(sku, 0.0) * multiplier * days
            sold = min(int(self._carry[sku]), item.quantity)
            self._carry[sku] -= int(self._carry[sku])
            self._sold30[sku] = self._sold30.get(sku, 0) + sold
            if pct or item.channel == "outlet":
                self.recovered_vnd += round(sold * item.unit_price_vnd * (1 - pct / 100))
            self.stock[sku] = replace(item, quantity=item.quantity - sold, days_in_stock=item.days_in_stock + days)

    # ------------------------------------------------------------------------------------------------ ShopWriter

    def _approval_problem(self, action: ActionSpec, grant: str | None, context: Mapping[str, Any]) -> str | None:
        if self.grant_secret is None:
            return None
        if grant:
            try:
                claims = verify_grant(grant, self.grant_secret, wall_clock=False)
            except jwt.PyJWTError as exc:
                return f"invalid approval grant: {exc}"
            return grant_violation(
                claims,
                action_id=str(context.get("action_id", action.action_id)),
                endpoint=action.endpoint,
                idempotency_key=action.idempotency_key,
                body=action.body,
                now=int(self.clock().timestamp()),
            )
        auto = self.autonomy.mode(action.capability) is AutonomyMode.AUTO_LOW
        if auto and action_tier(action) is RiskTier.LOW:
            return None
        return "approval required: no grant, and the action is not auto-approvable"

    async def execute(
        self, action: ActionSpec, *, grant: str | None = None, context: Mapping[str, Any] | None = None
    ) -> ActionResult:
        key, digest = action.idempotency_key, request_hash(action.endpoint, action.body)
        stored = self._stored.get(key)
        if stored is not None:  # idempotent replay: never apply twice
            if stored.request_hash != digest:
                return ActionResult(
                    False, detail="key reused with another body", status_code=409, error_code="conflict"
                )
            return stored.result
        problem = self._approval_problem(action, grant, context or {})
        if problem:
            self.sent.append(SentWrite(key, action.endpoint, dict(action.body), applied=False, grant=bool(grant)))
            return ActionResult(False, detail=problem, status_code=403, error_code="approval_required")
        if action.type in self.fail_once_types:
            self.fail_once_types.discard(action.type)
            return ActionResult(
                False,
                detail=f"injected one-time failure for {action.type}",
                status_code=500,
                error_code="injected",
                retryable=True,
            )
        if action.type in self.fail_types:
            return ActionResult(
                False,
                detail=f"injected failure for {action.type}",
                status_code=500,
                error_code="injected",
                retryable=True,
            )
        self._undo[key] = self._apply(action)
        self.sent.append(SentWrite(key, action.endpoint, dict(action.body), applied=True, grant=bool(grant)))
        result = ActionResult(True, ref=f"fake-action-{len(self._undo)}", detail=action.description, status_code=200)
        self._stored[key] = _Stored(digest, result)
        return result

    async def revert(
        self, of_key: str, *, idempotency_key: str, context: Mapping[str, Any] | None = None
    ) -> ActionResult:
        stored = self._stored.get(idempotency_key)
        if stored is not None:
            return stored.result
        undo = self._undo.pop(of_key, None)
        if undo is not None:
            undo()
        result = ActionResult(
            True, ref="fake-revert", detail="reverted" if undo else "nothing to revert", status_code=200
        )
        self._stored[idempotency_key] = _Stored(request_hash("revert", {"of_key": of_key}), result)
        return result

    def applied(self, endpoint: str | None = None) -> list[SentWrite]:
        return [w for w in self.sent if w.applied and (endpoint is None or w.endpoint == endpoint)]

    # ------------------------------------------------------------------------------------------------ handlers

    def _apply(self, action: ActionSpec) -> Undo:
        body = action.body
        if action.type == "apply_discount":
            previous = {s: self.discounts.get(s) for s in body["skus"]}
            self.discounts.update({s: float(body["percent"]) for s in body["skus"]})

            def undo_discount() -> None:
                for sku, old in previous.items():
                    if old is None:
                        self.discounts.pop(sku, None)
                    else:
                        self.discounts[sku] = old

            return undo_discount
        if action.type == "adjust_inventory":
            sku, old_status = body["sku"], self.statuses.get(body["sku"])
            self.statuses[sku] = body["new_status"]

            def undo_status() -> None:
                if old_status is None:
                    self.statuses.pop(sku, None)
                else:
                    self.statuses[sku] = old_status

            return undo_status
        if action.type == "create_task":
            task = dict(body)
            self.tasks.append(task)
            return lambda: self.tasks.remove(task)
        if action.type == "switch_channel":
            previous_channels = {s: self.stock[s].channel for s in body["skus"] if s in self.stock}
            for sku in previous_channels:
                self.stock[sku] = replace(self.stock[sku], channel=body["to_channel"])

            def undo_channel() -> None:
                for sku, channel in previous_channels.items():
                    self.stock[sku] = replace(self.stock[sku], channel=channel)

            return undo_channel
        if action.type == "update_sop_checklist":
            items = list(body["add_items"])
            self.checklists.setdefault(body["sop_id"], []).extend(items)

            def undo_items() -> None:
                for item in items:
                    self.checklists[body["sop_id"]].remove(item)

            return undo_items
        raise ValueError(f"FakeShop has no handler for {action.type}")
