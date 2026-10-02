"""FakeShop: an in-memory shop implementing ShopReader and ShopWriter, for tests, `simulate` and local development.

It behaves like the web Agent API where it matters: idempotent replay (409 for a key reused with another body), the
kill switch, approval grants (a `shop_change` write needs a valid grant, or its capabilities in `auto_low` and the
request inside the low-risk caps), every limit of `domain.growth.policies` (the same rules and test vectors as the
web), revert, failure injection, and simulated sales (`advance_days`) so Measure sees a before and after. Promotions,
campaigns, posts, ads and their metrics live in `FakeMarketing`.
"""

from __future__ import annotations

import asyncio
import random
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt

from shop_agent.adapters.fake_marketing import (
    AdRecord,
    CampaignRecord,
    CouponRecord,
    DiscountRecord,
    FakeMarketing,
    PostRecord,
    schedule,
)
from shop_agent.adapters.fake_world import FakeWorld, products_from
from shop_agent.adapters.grant_tokens import verify_grant
from shop_agent.domain.actions import ActionSpec
from shop_agent.domain.approval import grant_violation, request_hash
from shop_agent.domain.growth.market import MARKET_OBSERVATIONS_ENDPOINT, MarketObservations
from shop_agent.domain.growth.marketing import (
    METRICS_SYNC_ENDPOINT,
    NOTIFICATIONS_ENDPOINT,
    OUTCOMES_ENDPOINT,
    AdminNotification,
    MetricsSync,
    Outcome,
)
from shop_agent.domain.growth.policies import ProductState, ShopState, Verdict, evaluate
from shop_agent.domain.growth.settings import GrowthSettings
from shop_agent.domain.growth.snapshot import CatalogItem, GrowthSnapshot, vn_date
from shop_agent.domain.kpi_calc import snapshot_kpis
from shop_agent.domain.policies.autonomy import AutonomySettings
from shop_agent.domain.ports import ActionResult
from shop_agent.domain.shop import ReturnRecord, ShopSnapshot, StockItem

Clock = Callable[[], datetime]
Undo = Callable[[], None]
MARKETING_TYPES = frozenset(
    {
        "create_coupon",
        "end_promotion",
        "create_campaign",
        "create_post",
        "create_ad",
        "activate_ad",
        "pause_ad",
        "set_ad_budget",
        "set_ad_optimization",
    }
)


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
    # Owner settings this shop reports in place of the scenario's (keys as in analytics.agent_settings).
    settings: dict[str, Any] = field(default_factory=dict)
    # The growth data (FakeWorld); built on first use from `scenario` over this shop's stock.
    world: FakeWorld | None = None
    scenario: str = "baseline"
    marketing: FakeMarketing = field(default_factory=FakeMarketing)

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

    async def growth_snapshot(self, now: datetime) -> GrowthSnapshot:
        world = await self._world(now)
        m = self.marketing
        snapshot = world.snapshot(now, self._catalog(now))
        settings = self._settings(snapshot)
        self._set_ad_cap(snapshot, settings)
        return replace(
            snapshot,
            settings=settings,
            promotions=m.promotions(now),
            campaigns=m.campaign_rows(),
            ads=m.ad_rows(),
            posts=m.post_rows(now),
            ad_metrics=tuple(sorted(m.ad_metrics.values(), key=lambda r: (r.day, r.ad_ref))),
            post_metrics=tuple(sorted(m.post_metrics.values(), key=lambda r: (r.day, r.post_ref))),
            conversion_stats=m.conversion_stats(vn_date(now)),
            budget=(m.budget_period(now),),
            outcomes=tuple(m.outcomes),
            assets=tuple(m.assets),
        )

    def _settings(self, snapshot: GrowthSnapshot) -> GrowthSettings:
        """The owner's settings as this shop reports and enforces them: the scenario's, with the settings and autonomy
        modes this shop was given (tests set them) in place of the scenario's."""
        settings = GrowthSettings.from_values({**snapshot.settings.as_values(), **self.settings})
        autonomy = {**settings.autonomy, **self.autonomy.modes}
        return settings.model_copy(update={"autonomy": autonomy})

    def _set_ad_cap(self, snapshot: GrowthSnapshot, settings: GrowthSettings) -> None:
        """This month's ad cap, as analytics.growth_targets computes it: the owner's, else the auto value."""
        if settings.caps.monthly_ad_cap_vnd != "auto":
            self.marketing.cap_vnd = settings.caps.monthly_ad_cap_vnd
        elif snapshot.targets is not None:
            self.marketing.cap_vnd = snapshot.targets.monthly_ad_cap_vnd

    async def shop_state(self, now: datetime) -> ShopState:
        """What the web's rules read, from this shop (`domain.growth.policies.evaluate`)."""
        world = await self._world(now)
        snapshot = world.snapshot(now, [])
        settings = self._settings(snapshot)
        self._set_ad_cap(snapshot, settings)
        m = self.marketing
        return ShopState(
            now=now,
            settings=settings,
            products=tuple(
                ProductState(
                    sku=item.sku,
                    category=item.category,
                    price_vnd=item.unit_price_vnd,
                    cost_vnd=item.unit_cost_vnd,
                    created_at=now - timedelta(days=item.days_in_stock),
                    last_received_at=now - timedelta(days=item.days_in_stock),
                )
                for item in self.stock.values()
            ),
            discounts=m.discount_states(),
            coupons=m.coupon_states(now),
            campaigns=m.campaign_states(),
            ads=m.ad_states(),
            posts=m.post_states(),
            assets=m.asset_states(),
            budget=m.budget(),
            measured_platforms=m.measured_platforms(),
        )

    async def _world(self, now: datetime) -> FakeWorld:
        if self.world is None:  # reads the scenario and calendar files: off the event loop
            products = products_from(self.stock, self.base_daily)
            self.world = await asyncio.to_thread(FakeWorld.load, self.scenario, now, products)
        return self.world

    def _catalog(self, now: datetime) -> list[CatalogItem]:
        """The stock as the catalog view shows it: the running discount applied, held products not available."""
        items = []
        for item in self.stock.values():
            percent = self.discounts.get(item.sku, 0.0)
            items.append(
                CatalogItem(
                    sku=item.sku,
                    name=item.name,
                    brand="",
                    category=item.category,
                    category_name=item.category,
                    price_vnd=item.unit_price_vnd,
                    sale_price_vnd=round(item.unit_price_vnd * (100 - percent) / 100),
                    discount_pct=percent,
                    unit_cost_vnd=item.unit_cost_vnd,
                    quantity=item.quantity,
                    inventory_status=self.statuses.get(item.sku, "available"),
                    sales_channel=item.channel,
                    is_archived=False,
                    created_at=now - timedelta(days=item.days_in_stock),
                    last_received_at=now - timedelta(days=item.days_in_stock),
                )
            )
        return items

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

    def _grant_problem(self, action: ActionSpec, grant: str, context: Mapping[str, Any]) -> str | None:
        """Why the grant does not cover this request (signature, expiry, action, endpoint, key, body), or None."""
        assert self.grant_secret is not None  # noqa: S101 - only called when grants are enforced
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

    async def verdict(
        self, action: ActionSpec, grant: str | None = None, context: Mapping[str, Any] | None = None
    ) -> Verdict:
        """What the web would answer for this action now (without applying it)."""
        now = self.clock()
        has_grant = self.grant_secret is None  # grants are not enforced without a secret (local development)
        if grant and self.grant_secret is not None:
            problem = self._grant_problem(action, grant, context or {})
            if problem:
                return Verdict(403, "approval_required", "invalid_grant", problem)
            has_grant = True
        state = await self.shop_state(now)
        return evaluate(action.definition.endpoint, action.path_params, action.body, state, has_grant=has_grant)

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
        verdict = await self.verdict(action, grant, context)
        if not verdict.ok:
            self.sent.append(SentWrite(key, action.endpoint, dict(action.body), applied=False, grant=bool(grant)))
            return ActionResult(False, detail=verdict.detail, status_code=verdict.status, error_code=verdict.code)
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
        self._undo[key] = self._apply(action, verdict)
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

    async def ingest(self, endpoint: str, body: Mapping[str, Any], *, idempotency_key: str) -> ActionResult:
        """Collected data (market observations), once per key like the web; added to the FakeWorld."""
        digest = request_hash(endpoint, body)
        stored = self._stored.get(idempotency_key)
        if stored is not None:
            if stored.request_hash != digest:
                return ActionResult(
                    False, detail="key reused with another body", status_code=409, error_code="conflict"
                )
            return stored.result
        now = self.clock()
        if endpoint == MARKET_OBSERVATIONS_ENDPOINT:
            detail = (await self._world(now)).record(MarketObservations.model_validate(body), now)
        elif endpoint == METRICS_SYNC_ENDPOINT:
            await self.shop_state(now)  # this month's cap, from the world's growth targets
            detail = self.marketing.sync(now, MetricsSync.model_validate(body).lookback_days or 2)
        elif endpoint == OUTCOMES_ENDPOINT:
            detail = self.marketing.record_outcome(Outcome.model_validate(body))
        elif endpoint == NOTIFICATIONS_ENDPOINT:
            detail = self.marketing.notify(AdminNotification.model_validate(body), now)
        else:
            return ActionResult(False, detail=f"unknown endpoint {endpoint}", status_code=404, error_code="not_found")
        self.sent.append(SentWrite(idempotency_key, endpoint, dict(body), applied=True, grant=False))
        result = ActionResult(True, ref=f"fake-ingest-{len(self.sent)}", detail=detail, status_code=200)
        self._stored[idempotency_key] = _Stored(digest, result)
        return result

    def applied(self, endpoint: str | None = None) -> list[SentWrite]:
        return [w for w in self.sent if w.applied and (endpoint is None or w.endpoint == endpoint)]

    # ------------------------------------------------------------------------------------------------ handlers

    def _apply(self, action: ActionSpec, verdict: Verdict) -> Undo:
        body = action.body
        now = self.clock()
        if action.type == "apply_discount":
            return self._apply_discount(action, verdict, now)
        if action.type in MARKETING_TYPES:
            return self._apply_marketing(action, now)
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

    def _apply_discount(self, action: ActionSpec, verdict: Verdict, now: datetime) -> Undo:
        body = action.body
        skus = body.get("skus") or [s for s, item in self.stock.items() if item.category == body.get("category")]
        start, end = schedule(body, now)
        records = [
            DiscountRecord(
                sku, float(body["percent"]), action.idempotency_key, start, end, campaign_ref=body.get("campaign_ref")
            )
            for sku in skus
        ]
        undo_records = self.marketing.add_discounts(records, verdict.replaces, now)
        previous = {s: self.discounts.get(s) for s in skus}
        if start <= now:  # the effect on sales; a scheduled discount is only recorded
            self.discounts.update({s: float(body["percent"]) for s in skus})

        def undo_discount() -> None:
            undo_records()
            for sku, old in previous.items():
                if old is None:
                    self.discounts.pop(sku, None)
                else:
                    self.discounts[sku] = old

        return undo_discount

    def _apply_marketing(self, action: ActionSpec, now: datetime) -> Undo:
        body, m = action.body, self.marketing
        ref = action.path_params.get("ref", "")
        if action.type == "create_coupon":
            start, end = schedule(body, now)
            return m.add_coupon(
                CouponRecord(
                    code=body["code"],
                    title=body["title"],
                    percent=int(body["percent"]),
                    starts_at=start,
                    ends_at=end,
                    min_order_vnd=int(body.get("min_order_vnd", 0)),
                    usage_limit=body.get("usage_limit"),
                    campaign_ref=body.get("campaign_ref"),
                )
            )
        if action.type == "end_promotion":
            ended = m.end_promotions(ref, now)
            for discount in m.discounts:
                if discount.revoked_at == now and discount.sku in ended:
                    self.discounts.pop(discount.sku, None)
            return lambda: None  # protective: not reverted
        if action.type == "create_campaign":
            start, end = schedule(body, now)
            return m.add_campaign(
                CampaignRecord(
                    ref=body["ref"],
                    name=body["name"],
                    objective=body["objective"],
                    channels=list(body["channels"]),
                    thread_id=body.get("thread_id"),
                    starts_at=start,
                    ends_at=end,
                    budget_vnd=int(body.get("budget_vnd", 0)),
                    status="active" if start <= now else "draft",
                )
            )
        if action.type == "create_post":
            raw = body.get("scheduled_at")
            at = datetime.fromisoformat(raw) if isinstance(raw, str) else now
            at = at if at >= now + timedelta(minutes=10) else now
            status = "scheduled" if at > now else "published"
            return m.add_post(PostRecord(body["ref"], body.get("campaign_ref"), body["message"], at, status))
        if action.type == "create_ad":
            start, end = schedule(body, now)
            daily = int(body["daily_budget_vnd"])
            return m.add_ad(
                AdRecord(
                    ref=body["ref"],
                    campaign_ref=body["campaign_ref"],
                    platform=body["platform"],
                    objective=body.get("objective", "traffic"),
                    daily_budget_vnd=daily,
                    total_budget_vnd=daily * int(body["duration_days"]),
                    starts_at=start,
                    ends_at=end,
                )
            )
        ad = m.ads[ref]
        if action.type == "activate_ad":
            return m.activate(ad, now)
        if action.type == "pause_ad":
            ad.status = "paused" if ad.status == "active" else ad.status
            return lambda: None  # protective: not reverted
        if action.type == "set_ad_budget":
            return m.set_budget(ad, int(body["daily_budget_vnd"]), now)
        if action.type == "set_ad_optimization":
            return m.set_objective(ad, body["objective"])
        raise ValueError(f"FakeShop has no handler for {action.type}")
