"""FakeShop: an in-memory shop that implements both ShopReadPort and ShopActionPort.

Used for tests, the simulator and local development before the real Next.js app is attached.
It enforces idempotency keys, supports revert, can inject failures, and simulates sales
(`advance_days`) so Measure sees a realistic before/after.
"""
from __future__ import annotations

import random
from dataclasses import replace
from datetime import timedelta
from typing import Any, Callable, Sequence

from ci_agent.application.ports.shop import ActionResult
from ci_agent.application.ports.system import ClockPort
from ci_agent.domain.kpi import AVG_DAYS_IN_STOCK, DEAD_STOCK_VALUE, RECOVERED_VALUE, RETURN_RATE_PCT
from ci_agent.domain.models.shop import ReturnRecord, ShopSnapshot, StockItem


class FakeShop:
    def __init__(self, stock: list[StockItem], returns: list[ReturnRecord], base_daily: dict[str, float],
                 clock: ClockPort) -> None:
        self._clock = clock
        self._stock: dict[str, StockItem] = {i.sku: i for i in stock}
        self._returns = list(returns)
        self._base_daily = dict(base_daily)
        self._sold30: dict[str, int] = {s: round(self._base_daily.get(s, 0.0) * 30) for s in self._stock}
        self._carry: dict[str, float] = {}
        self.discounts: dict[str, float] = {}
        self.statuses: dict[str, str] = {}
        self.tasks: list[dict[str, Any]] = []
        self.checklists: dict[str, list[str]] = {}
        self.recovered_value = 0.0
        self.fail_types: set[str] = set()
        self.fail_once_types: set[str] = set()
        self.apply_counts: dict[str, int] = {}
        self._results: dict[str, ActionResult] = {}
        self._undo: dict[str, Callable[[], None]] = {}

    # ------------------------------------------------------------------ demo data
    @classmethod
    def seed_demo(cls, clock: ClockPort, n_stock: int = 500, n_returns: int = 100, seed: int = 7) -> "FakeShop":
        rng = random.Random(seed)
        cats = ["audio", "kitchen", "fitness", "toys", "office", "garden"]
        today = clock.now().date()
        stock: list[StockItem] = []
        base: dict[str, float] = {}
        for n in range(n_stock):
            sku, cat = f"SKU-{n:04d}", rng.choice(cats)
            cost = round(rng.uniform(4, 60), 2)
            roll = rng.random()
            if roll < 0.12:  # dead stock
                item = StockItem(sku, f"{cat} item {n}", cat, rng.randint(20, 120), cost, round(cost * 1.8, 2),
                                 rng.randint(100, 300), condition=rng.choice(["new", "new", "open_box"]))
                base[sku] = round(rng.uniform(0.0, 0.12), 3)
            elif roll < 0.20:  # near expiry
                item = StockItem(sku, f"{cat} item {n}", cat, rng.randint(10, 60), cost, round(cost * 1.6, 2),
                                 rng.randint(30, 90), expiry_date=today + timedelta(days=rng.randint(3, 25)))
                base[sku] = round(rng.uniform(0.2, 0.6), 3)
            else:  # healthy
                item = StockItem(sku, f"{cat} item {n}", cat, rng.randint(5, 80), cost, round(cost * 1.7, 2),
                                 rng.randint(3, 80))
                base[sku] = round(rng.uniform(0.6, 3.5), 3)
            stock.append(item)
        healthy = [i.sku for i in stock if base[i.sku] > 1.0]
        problem = rng.sample(healthy, k=min(3, len(healthy)))
        returns: list[ReturnRecord] = []
        for m in range(n_returns):
            sku = problem[m % len(problem)] if m < n_returns * 0.4 else rng.choice([i.sku for i in stock])
            returns.append(ReturnRecord(f"ORD-{m:05d}", sku,
                                        rng.choice(["not as described", "not as described", "defective", "changed mind"]),
                                        rng.choice(["new", "open_box", "damaged"]),
                                        clock.now() - timedelta(days=rng.randint(1, 25)),
                                        round(rng.uniform(10, 90), 2)))
        for sku in problem:  # keep problem SKUs' sales low so their return rate is high
            base[sku] = 1.0
        return cls(stock, returns, base, clock)

    # ---------------------------------------------------------------- read port
    def snapshot(self) -> ShopSnapshot:
        return ShopSnapshot(taken_at=self._clock.now(), stock=tuple(self._stock.values()),
                            returns=tuple(self._returns), units_sold_30d=dict(self._sold30))

    def kpis(self, names: Sequence[str]) -> dict[str, float]:
        snap = self.snapshot()
        dead = sum(i.quantity * i.unit_cost for i in snap.stock
                   if i.quantity > 0 and i.days_in_stock >= 90 and snap.velocity(i.sku) <= 0.2)
        on_hand = [i for i in snap.stock if i.quantity > 0]
        sold = sum(snap.units_sold_30d.values()) or 1
        values = {
            DEAD_STOCK_VALUE: round(dead, 2),
            RETURN_RATE_PCT: round(len(self._returns) / sold * 100.0, 3),
            RECOVERED_VALUE: round(self.recovered_value, 2),
            AVG_DAYS_IN_STOCK: round(sum(i.days_in_stock for i in on_hand) / len(on_hand), 2) if on_hand else 0.0,
        }
        return {n: values[n] for n in names if n in values}

    # ---------------------------------------------------------------- simulation
    def advance_days(self, days: int) -> None:
        for sku, item in list(self._stock.items()):
            pct = self.discounts.get(sku, 0.0)
            mult = 1 + pct / 100 * 40 + (3.0 if item.channel == "outlet" else 0.0)
            self._carry[sku] = self._carry.get(sku, 0.0) + self._base_daily.get(sku, 0.0) * mult * days
            sold = min(int(self._carry[sku]), item.quantity)
            self._carry[sku] -= int(self._carry[sku])
            self._sold30[sku] = self._sold30.get(sku, 0) + sold
            self.recovered_value += sold * item.unit_price * (1 - pct / 100) if pct or item.channel == "outlet" else 0
            self._stock[sku] = replace(item, quantity=item.quantity - sold,
                                       days_in_stock=item.days_in_stock + days)

    # -------------------------------------------------------------- action port
    def _run(self, key: str, kind: str, apply: Callable[[], Callable[[], None]], dry_run: bool = False) -> ActionResult:
        if key in self._results:
            return self._results[key]  # idempotent replay: do not apply twice
        if dry_run:
            return ActionResult(True, detail=f"dry run: {kind} would be applied")
        if kind in self.fail_once_types:
            self.fail_once_types.discard(kind)
            return ActionResult(False, detail=f"injected one-time failure for {kind}")
        if kind in self.fail_types:
            return ActionResult(False, detail=f"injected failure for {kind}")
        self._undo[key] = apply()
        self.apply_counts[kind] = self.apply_counts.get(kind, 0) + 1
        result = ActionResult(True, external_ref=f"fake:{kind}:{len(self._undo)}")
        self._results[key] = result
        return result

    def apply_discount(self, *, idempotency_key: str, skus: list[str], percent: float, duration_days: int,
                       dry_run: bool = False) -> ActionResult:
        def apply() -> Callable[[], None]:
            previous = {s: self.discounts.get(s) for s in skus}
            self.discounts.update({s: percent for s in skus})

            def undo() -> None:
                for s, old in previous.items():
                    self.discounts.pop(s, None) if old is None else self.discounts.__setitem__(s, old)
            return undo
        return self._run(idempotency_key, "apply_discount", apply, dry_run)

    def adjust_inventory(self, *, idempotency_key: str, sku: str, new_status: str, reason: str,
                         dry_run: bool = False) -> ActionResult:
        def apply() -> Callable[[], None]:
            previous = self.statuses.get(sku)
            self.statuses[sku] = new_status

            def undo() -> None:
                self.statuses.pop(sku, None) if previous is None else self.statuses.__setitem__(sku, previous)
            return undo
        return self._run(idempotency_key, "adjust_inventory", apply, dry_run)

    def create_task(self, *, idempotency_key: str, title: str, assignee_role: str, description: str,
                    due_in_days: int | None = None) -> ActionResult:
        def apply() -> Callable[[], None]:
            task = {"title": title, "assignee_role": assignee_role, "description": description,
                    "due_in_days": due_in_days}
            self.tasks.append(task)
            return lambda: self.tasks.remove(task)
        return self._run(idempotency_key, "create_task", apply)

    def switch_channel(self, *, idempotency_key: str, skus: list[str], to_channel: str,
                       dry_run: bool = False) -> ActionResult:
        def apply() -> Callable[[], None]:
            previous = {s: self._stock[s].channel for s in skus if s in self._stock}
            for s in previous:
                self._stock[s] = replace(self._stock[s], channel=to_channel)

            def undo() -> None:
                for s, ch in previous.items():
                    self._stock[s] = replace(self._stock[s], channel=ch)
            return undo
        return self._run(idempotency_key, "switch_channel", apply, dry_run)

    def update_sop_checklist(self, *, idempotency_key: str, sop_id: str, add_items: list[str]) -> ActionResult:
        def apply() -> Callable[[], None]:
            self.checklists.setdefault(sop_id, []).extend(add_items)

            def undo() -> None:
                for item in add_items:
                    self.checklists[sop_id].remove(item)
            return undo
        return self._run(idempotency_key, "update_sop_checklist", apply)

    def revert(self, *, idempotency_key: str, of_key: str) -> ActionResult:
        if idempotency_key in self._results:
            return self._results[idempotency_key]
        undo = self._undo.pop(of_key, None)
        if undo is not None:
            undo()
        result = ActionResult(True, detail="reverted" if undo else "nothing to revert")
        self._results[idempotency_key] = result
        return result



