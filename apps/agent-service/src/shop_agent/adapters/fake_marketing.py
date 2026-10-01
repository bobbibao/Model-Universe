"""FakeMarketing: the promotions, campaigns, posts and ads of FakeShop, and the platforms behind them.

It keeps what the web keeps (agent_action undo data aside): promotion records, coupons, campaigns, posts, ads with
their budget reservations and spend, daily metrics, measured outcomes and admin notifications. Platform metrics are
simulated deterministically from each ad's budget (like the web's fake platforms), so a metrics sync, a budget ledger
and a guard see realistic numbers. The rules are not here: FakeShop checks every request with
`domain.growth.policies.evaluate` before it calls these methods.
"""

from __future__ import annotations

import hashlib
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any

from shop_agent.domain.growth.marketing import AdminNotification, Outcome
from shop_agent.domain.growth.policies import (
    AdState,
    AssetState,
    BudgetState,
    CampaignState,
    CouponState,
    DiscountState,
    PostState,
    campaign_kind,
)
from shop_agent.domain.growth.snapshot import (
    Ad,
    AdDailyMetrics,
    BudgetPeriod,
    ConversionStats,
    MarketingAsset,
    MarketingCampaign,
    MarketingOutcome,
    Post,
    PostDailyMetrics,
    Promotion,
    vn_date,
)

Undo = Callable[[], None]
NOTIFICATIONS_PER_DAY = 20
AVERAGE_ORDER_VND = 600_000


def _roll(*parts: object) -> int:
    """A stable number in [0, 1000) for the given parts."""
    digest = hashlib.sha256("|".join(str(p) for p in parts).encode()).digest()
    return int.from_bytes(digest[:4], "big") % 1000


@dataclass
class DiscountRecord:
    sku: str
    percent: float
    action: str
    starts_at: datetime
    ends_at: datetime
    source: str = "agent"
    campaign_ref: str | None = None
    revoked_at: datetime | None = None


@dataclass
class CouponRecord:
    code: str
    title: str
    percent: int
    starts_at: datetime
    ends_at: datetime
    min_order_vnd: int = 0
    usage_limit: int | None = None
    usage_count: int = 0
    active: bool = True
    source: str = "agent"
    campaign_ref: str | None = None

    def usable(self, now: datetime) -> bool:
        within = self.starts_at <= now < self.ends_at
        return self.active and within and (self.usage_limit is None or self.usage_count < self.usage_limit)


@dataclass
class CampaignRecord:
    ref: str
    name: str
    objective: str
    channels: list[str]
    thread_id: str | None
    starts_at: datetime
    ends_at: datetime
    budget_vnd: int
    status: str = "active"


@dataclass
class AdRecord:
    ref: str
    campaign_ref: str
    platform: str
    objective: str
    daily_budget_vnd: int
    total_budget_vnd: int
    starts_at: datetime
    ends_at: datetime
    status: str = "paused"
    activated_at: datetime | None = None
    reserved_vnd: int = 0
    spent_vnd: int = 0


@dataclass
class PostRecord:
    ref: str
    campaign_ref: str | None
    message: str
    at: datetime
    status: str = "published"


@dataclass
class FakeMarketing:
    cap_vnd: int = 10_000_000  # this month's ad cap; FakeShop sets it from the world's growth targets
    discounts: list[DiscountRecord] = field(default_factory=list)
    coupons: dict[str, CouponRecord] = field(default_factory=dict)
    campaigns: dict[str, CampaignRecord] = field(default_factory=dict)
    ads: dict[str, AdRecord] = field(default_factory=dict)
    posts: dict[str, PostRecord] = field(default_factory=dict)
    assets: list[MarketingAsset] = field(default_factory=list)
    ad_metrics: dict[tuple[str, date], AdDailyMetrics] = field(default_factory=dict)
    post_metrics: dict[tuple[str, date], PostDailyMetrics] = field(default_factory=dict)
    outcomes: list[MarketingOutcome] = field(default_factory=list)
    notifications: list[tuple[datetime, AdminNotification]] = field(default_factory=list)

    # ------------------------------------------------------------------------------------------------ state

    @property
    def reserved_vnd(self) -> int:
        return sum(ad.reserved_vnd for ad in self.ads.values())

    @property
    def spent_vnd(self) -> int:
        return sum(ad.spent_vnd for ad in self.ads.values())

    def budget(self) -> BudgetState:
        return BudgetState(cap_vnd=self.cap_vnd, reserved_vnd=self.reserved_vnd, spent_vnd=self.spent_vnd)

    def discount_states(self) -> tuple[DiscountState, ...]:
        return tuple(
            DiscountState(
                sku=d.sku,
                percent=d.percent,
                source="agent" if d.source == "agent" else "admin",
                action=d.action,
                starts_at=d.starts_at,
                ends_at=d.ends_at,
                revoked=d.revoked_at is not None,
                campaign_ref=d.campaign_ref,
            )
            for d in self.discounts
        )

    def coupon_states(self, now: datetime) -> tuple[CouponState, ...]:
        return tuple(
            CouponState(
                code=c.code,
                percent=c.percent,
                source="agent" if c.source == "agent" else "admin",
                usable=c.usable(now),
                campaign_ref=c.campaign_ref,
            )
            for c in self.coupons.values()
        )

    def campaign_states(self) -> tuple[CampaignState, ...]:
        return tuple(
            CampaignState(ref=c.ref, budget_vnd=c.budget_vnd, status=c.status) for c in self.campaigns.values()
        )

    def ad_states(self) -> tuple[AdState, ...]:
        return tuple(
            AdState(
                ref=a.ref,
                campaign_ref=a.campaign_ref,
                platform=a.platform,
                status=a.status,
                daily_budget_vnd=a.daily_budget_vnd,
                total_budget_vnd=a.total_budget_vnd,
                ends_at=a.ends_at,
            )
            for a in self.ads.values()
        )

    def post_states(self) -> tuple[PostState, ...]:
        return tuple(PostState(ref=p.ref, at=p.at) for p in self.posts.values() if p.status != "removed")

    def asset_states(self) -> tuple[AssetState, ...]:
        return tuple(AssetState(id=a.asset_id, kind="video" if a.kind == "video" else "image") for a in self.assets)

    def conversion_stats(self, today: date) -> tuple[ConversionStats, ...]:
        """Purchases per platform, as the web's server-side events count them (here: the ads' reported conversions)."""
        counts: dict[str, list[int]] = {}
        for row in self.ad_metrics.values():
            age = (today - row.day).days
            if 0 <= age < 30:
                week, month = counts.setdefault(row.platform, [0, 0])
                counts[row.platform] = [week + (row.conversions if age < 7 else 0), month + row.conversions]
        return tuple(ConversionStats(p, week, month) for p, (week, month) in sorted(counts.items()))

    def measured_platforms(self) -> frozenset[str]:
        return frozenset(o.capability.removeprefix("ads_") for o in self.outcomes if o.capability.startswith("ads_"))

    # ------------------------------------------------------------------------------------------------ snapshot

    def promotions(self, now: datetime) -> tuple[Promotion, ...]:
        discounts = [
            Promotion(
                kind="discount",
                ref=d.action,
                sku=d.sku,
                percent=d.percent,
                starts_at=d.starts_at,
                ends_at=d.ends_at,
                revoked_at=d.revoked_at,
                source=d.source,
                campaign_ref=d.campaign_ref,
                min_order_vnd=0,
                usage_limit=None,
                usage_count=None,
                active=d.revoked_at is None and d.starts_at <= now < d.ends_at,
                action_key=d.action,
            )
            for d in self.discounts
        ]
        coupons = [
            Promotion(
                kind="coupon",
                ref=c.code,
                sku=None,
                percent=c.percent,
                starts_at=c.starts_at,
                ends_at=c.ends_at,
                revoked_at=None,
                source=c.source,
                campaign_ref=c.campaign_ref,
                min_order_vnd=c.min_order_vnd,
                usage_limit=c.usage_limit,
                usage_count=c.usage_count,
                active=c.usable(now),
            )
            for c in self.coupons.values()
        ]
        return tuple(discounts + coupons)

    def campaign_rows(self) -> tuple[MarketingCampaign, ...]:
        return tuple(
            MarketingCampaign(
                ref=c.ref,
                kind=campaign_kind(c.channels),
                objective=c.objective,
                thread_id=c.thread_id,
                status=c.status,
                starts_at=c.starts_at,
                ends_at=c.ends_at,
                budget_vnd=c.budget_vnd,
                utm_campaign=c.ref,
            )
            for c in self.campaigns.values()
        )

    def ad_rows(self) -> tuple[Ad, ...]:
        return tuple(
            Ad(
                ref=a.ref,
                campaign_ref=a.campaign_ref,
                platform=a.platform,
                status=a.status,
                objective=a.objective,
                daily_budget_vnd=a.daily_budget_vnd,
                total_budget_vnd=a.total_budget_vnd,
                starts_at=a.starts_at,
                ends_at=a.ends_at,
                activated_at=a.activated_at,
            )
            for a in self.ads.values()
        )

    def post_rows(self, now: datetime) -> tuple[Post, ...]:
        return tuple(
            Post(
                ref=p.ref,
                campaign_ref=p.campaign_ref,
                platform="facebook",
                status="published" if p.status == "scheduled" and p.at <= now else p.status,
                scheduled_at=p.at if p.status == "scheduled" else None,
                published_at=p.at if p.status != "scheduled" or p.at <= now else None,
            )
            for p in self.posts.values()
        )

    def budget_period(self, now: datetime) -> BudgetPeriod:
        budget = self.budget()
        return BudgetPeriod(
            period=f"{vn_date(now):%Y-%m}",
            cap_vnd=budget.cap_vnd,
            reserved_vnd=budget.reserved_vnd,
            spent_vnd=budget.spent_vnd,
            remaining_vnd=budget.remaining_vnd,
        )

    # ------------------------------------------------------------------------------------------------ writes

    def add_discounts(self, records: list[DiscountRecord], replaces: tuple[str, ...], now: datetime) -> Undo:
        replaced = [d for d in self.discounts if d.action in replaces and d.revoked_at is None]
        for record in replaced:
            record.revoked_at = now
        self.discounts.extend(records)

        def undo() -> None:
            for record in records:
                record.revoked_at = record.revoked_at or now
            for record in replaced:  # the discounts it replaced run again
                record.revoked_at = None

        return undo

    def add_coupon(self, coupon: CouponRecord) -> Undo:
        self.coupons[coupon.code] = coupon

        def undo() -> None:
            coupon.active = False

        return undo

    def end_promotions(self, ref: str, now: datetime) -> list[str]:
        """Protective: the agent's coupon `ref`, or every agent discount and coupon of campaign `ref`."""
        ended = []
        for coupon in self.coupons.values():
            if coupon.source == "agent" and coupon.active and ref in (coupon.code, coupon.campaign_ref):
                coupon.active = False
                ended.append(coupon.code)
        for discount in self.discounts:
            if discount.source == "agent" and discount.revoked_at is None and discount.campaign_ref == ref:
                discount.revoked_at = now
                ended.append(discount.sku)
        return ended

    def add_campaign(self, campaign: CampaignRecord) -> Undo:
        self.campaigns[campaign.ref] = campaign

        def undo() -> None:
            campaign.status = "reverted"

        return undo

    def add_post(self, post: PostRecord) -> Undo:
        self.posts[post.ref] = post

        def undo() -> None:
            post.status = "removed"

        return undo

    def add_ad(self, ad: AdRecord) -> Undo:
        ad.reserved_vnd = ad.total_budget_vnd
        self.ads[ad.ref] = ad

        def undo() -> None:
            ad.status = "reverted"
            self.release(ad)

        return undo

    def release(self, ad: AdRecord) -> None:
        """Give back what the ad reserved and has not spent."""
        ad.reserved_vnd = min(ad.reserved_vnd, ad.spent_vnd)

    def activate(self, ad: AdRecord, now: datetime) -> Undo:
        previous = ad.status
        ad.status, ad.activated_at = "active", ad.activated_at or now

        def undo() -> None:
            ad.status = previous if previous != "active" else "paused"

        return undo

    def set_budget(self, ad: AdRecord, daily: int, now: datetime) -> Undo:
        before = (ad.daily_budget_vnd, ad.total_budget_vnd, ad.reserved_vnd)
        days_left = max(1, -(-int((ad.ends_at - now).total_seconds()) // 86_400))
        delta = (daily - ad.daily_budget_vnd) * days_left
        ad.daily_budget_vnd = daily
        ad.total_budget_vnd = max(ad.spent_vnd, ad.total_budget_vnd + delta)
        ad.reserved_vnd = max(ad.spent_vnd, ad.reserved_vnd + delta)

        def undo() -> None:
            ad.daily_budget_vnd, ad.total_budget_vnd, ad.reserved_vnd = before

        return undo

    def set_objective(self, ad: AdRecord, objective: str) -> Undo:
        previous = ad.objective
        ad.objective = objective

        def undo() -> None:
            ad.objective = previous

        return undo

    # ------------------------------------------------------------------------------------------------ ingestion

    def sync(self, now: datetime, lookback_days: int) -> str:
        """What the platforms report for the last days, recorded like the web's metrics sync; overspend pauses."""
        today = vn_date(now)
        days = [today - timedelta(days=n) for n in range(lookback_days - 1, -1, -1)]
        for ad in self.ads.values():
            if ad.activated_at is None:
                continue
            for day in days:
                if not vn_date(ad.activated_at) <= day <= vn_date(ad.ends_at) or (ad.ref, day) in self.ad_metrics:
                    continue
                if ad.status != "active" and day == today:
                    continue
                spend = min(
                    round(ad.daily_budget_vnd * (0.7 + 0.3 * _roll(ad.ref, day) / 1000) / 1000) * 1000,
                    ad.total_budget_vnd - ad.spent_vnd,
                )
                cpc = 3_000 + _roll(ad.ref, day, "cpc") * 3
                clicks = max(spend, 0) // cpc
                conversions = round(clicks * (0.02 + _roll(ad.ref, day, "cvr") / 50_000))
                self.ad_metrics[(ad.ref, day)] = AdDailyMetrics(
                    ad_ref=ad.ref,
                    campaign_ref=ad.campaign_ref,
                    platform=ad.platform,
                    day=day,
                    impressions=clicks * 40,
                    clicks=clicks,
                    spend_vnd=max(spend, 0),
                    conversions=conversions,
                    conversion_value_vnd=conversions * AVERAGE_ORDER_VND,
                    ad_status=ad.status,
                    objective=ad.objective,
                )
                ad.spent_vnd += max(spend, 0)
            if ad.spent_vnd >= ad.total_budget_vnd and ad.status == "active":
                ad.status = "ended"
                self.release(ad)
        for post in self.posts.values():
            if post.status == "removed" or post.at > now:
                continue
            for day in days:
                age = (day - vn_date(post.at)).days
                if age < 0 or (post.ref, day) in self.post_metrics:
                    continue
                views = (300 + _roll(post.ref) * 1.2) / (2**age)
                self.post_metrics[(post.ref, day)] = PostDailyMetrics(
                    post_ref=post.ref,
                    campaign_ref=post.campaign_ref,
                    day=day,
                    impressions=round(views),
                    reach=round(views * 0.7),
                    engagements=round(views * 0.03),
                    clicks=round(views * 0.01),
                    published_at=post.at,
                )
        paused = []
        if self.spent_vnd > self.cap_vnd:  # over the month's cap: every agent ad stops
            for ad in self.ads.values():
                if ad.status == "active":
                    ad.status = "paused"
                    paused.append(ad.ref)
        return f"synced {len(self.ads)} ad(s), {len(self.posts)} post(s); paused for overspend: {len(paused)}"

    def record_outcome(self, outcome: Outcome) -> str:
        self.outcomes.append(
            MarketingOutcome(
                thread_id=outcome.thread_id,
                campaign_ref=outcome.campaign_ref,
                capability=outcome.capability.value,
                verdict=outcome.verdict,
                incremental_revenue_vnd=outcome.incremental_revenue_vnd or 0,
                incremental_profit_vnd=outcome.incremental_profit_vnd or 0,
                spend_vnd=outcome.spend_vnd or 0,
                confidence=outcome.confidence,
                measured_at=outcome.measured_at,
            )
        )
        return f"outcome {outcome.verdict} for {outcome.thread_id}"

    def notify(self, notification: AdminNotification, now: datetime) -> str:
        today = [n for at, n in self.notifications if vn_date(at) == vn_date(now)]
        if notification.dedupe_key and any(n.dedupe_key == notification.dedupe_key for n in today):
            return "already sent today"
        if len(today) >= NOTIFICATIONS_PER_DAY:
            return f"not sent: {NOTIFICATIONS_PER_DAY} notifications today already"
        self.notifications.append((now, notification))
        return "sent to the admins"


def schedule(body: dict[str, Any], now: datetime) -> tuple[datetime, datetime]:
    """When a request with `starts_at` and `duration_days` runs (a past or absent start means now)."""
    raw = body.get("starts_at")
    start = datetime.fromisoformat(raw) if isinstance(raw, str) else now
    start = max(start, now)
    return start, start + timedelta(days=int(body["duration_days"]))
