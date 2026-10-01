"""What the growth agent sees of the shop and its market at one moment (the analytics views, money in whole VND).

Adapters build it from the web's views (`shop_db`) or a scenario (`FakeWorld`); detectors, estimators and read tools
only ever see these types. Days are calendar days in Vietnam.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from shop_agent.domain.growth.settings import GrowthSettings

VN = ZoneInfo("Asia/Ho_Chi_Minh")


def vn_date(instant: datetime) -> date:
    return instant.astimezone(VN).date()


@dataclass(frozen=True)
class DailySales:
    day: date
    orders: int
    units: int
    revenue_vnd: int
    coupon_discount_vnd: int
    gross_profit_vnd: int
    attributed_orders: int


@dataclass(frozen=True)
class SkuDailySales:
    day: date
    sku: str
    units: int
    revenue_vnd: int


@dataclass(frozen=True)
class CatalogItem:
    sku: str
    name: str
    brand: str
    category: str  # slug
    category_name: str
    price_vnd: int  # list price
    sale_price_vnd: int  # what a customer pays now (the highest running discount applied)
    discount_pct: float
    unit_cost_vnd: int
    quantity: int
    inventory_status: str
    sales_channel: str
    is_archived: bool
    created_at: datetime
    description: str = ""
    last_received_at: datetime | None = None  # the last goods receipt (dead stock: 180 days or more ago)

    @property
    def sellable(self) -> bool:
        return not self.is_archived and self.inventory_status == "available"


@dataclass(frozen=True)
class Promotion:
    kind: str  # discount | coupon
    ref: str
    sku: str | None
    percent: float
    starts_at: datetime
    ends_at: datetime
    revoked_at: datetime | None
    source: str  # admin | agent
    campaign_ref: str | None
    min_order_vnd: int
    usage_limit: int | None
    usage_count: int | None
    active: bool
    action_key: str | None = None  # the agent action that created it (one action discounts several SKUs)


@dataclass(frozen=True)
class MarketingCampaign:
    ref: str
    kind: str
    objective: str
    thread_id: str | None
    status: str
    starts_at: datetime | None
    ends_at: datetime | None
    budget_vnd: int
    utm_campaign: str


@dataclass(frozen=True)
class Ad:
    ref: str
    campaign_ref: str | None
    platform: str  # meta | google | tiktok
    status: str  # paused | active | ended | reverted
    objective: str
    daily_budget_vnd: int
    total_budget_vnd: int
    starts_at: datetime | None
    ends_at: datetime | None
    activated_at: datetime | None


@dataclass(frozen=True)
class Post:
    ref: str
    campaign_ref: str | None
    platform: str
    status: str  # scheduled | published | removed | failed
    scheduled_at: datetime | None
    published_at: datetime | None


@dataclass(frozen=True)
class AdDailyMetrics:
    ad_ref: str
    campaign_ref: str | None
    platform: str
    day: date
    impressions: int
    clicks: int
    spend_vnd: int
    conversions: int
    conversion_value_vnd: int
    ad_status: str | None
    objective: str | None


@dataclass(frozen=True)
class PostDailyMetrics:
    post_ref: str
    campaign_ref: str | None
    day: date
    impressions: int
    reach: int
    engagements: int
    clicks: int
    published_at: datetime | None


@dataclass(frozen=True)
class BudgetPeriod:
    period: str  # YYYY-MM
    cap_vnd: int
    reserved_vnd: int
    spent_vnd: int
    remaining_vnd: int


@dataclass(frozen=True)
class MarketingOutcome:
    thread_id: str
    campaign_ref: str | None
    capability: str
    verdict: str
    incremental_revenue_vnd: int
    incremental_profit_vnd: int
    spend_vnd: int
    confidence: float | None
    measured_at: datetime


@dataclass(frozen=True)
class MarketingAsset:
    asset_id: int
    kind: str  # image | video
    url: str
    title: str
    sku: str | None
    created_at: datetime


@dataclass(frozen=True)
class CompetitorPrice:
    competitor: str
    competitor_website: str | None
    sku: str | None
    url: str | None
    watch: bool
    source: str
    title: str | None
    price_vnd: int
    observed_at: datetime
    confidence: float


@dataclass(frozen=True)
class CompetitorCampaign:
    competitor: str
    title: str
    category: str | None
    discount_pct: float | None
    starts_at: datetime | None
    ends_at: datetime | None
    url: str | None
    source: str
    observed_at: datetime


@dataclass(frozen=True)
class TrendPoint:
    keyword: str
    geo: str
    day: date
    interest: int
    source: str


@dataclass(frozen=True)
class MarketEvent:
    code: str
    name: str
    starts_on: date
    ends_on: date
    lead_days: int
    categories: tuple[str, ...] = ()


@dataclass(frozen=True)
class SourceHealth:
    name: str
    status: str  # ok | degraded | blocked | off
    detail: str | None
    last_run_at: datetime | None
    last_success_at: datetime | None


@dataclass(frozen=True)
class GrowthTargets:
    """This month's revenue target and paid-marketing cap (the owner's numbers or the automatic ones)."""

    month: date
    trailing_monthly_revenue_vnd: int | None
    revenue_target_vnd: int | None
    revenue_target_source: str  # owner | auto_last_year | auto_trailing_3m | none
    monthly_ad_cap_vnd: int
    monthly_ad_cap_source: str  # owner | auto | none


@dataclass(frozen=True)
class GrowthSnapshot:
    taken_at: datetime
    sales_daily: tuple[DailySales, ...] = ()
    sku_sales_daily: tuple[SkuDailySales, ...] = ()
    catalog: tuple[CatalogItem, ...] = ()
    promotions: tuple[Promotion, ...] = ()
    campaigns: tuple[MarketingCampaign, ...] = ()
    ads: tuple[Ad, ...] = ()
    posts: tuple[Post, ...] = ()
    ad_metrics: tuple[AdDailyMetrics, ...] = ()
    post_metrics: tuple[PostDailyMetrics, ...] = ()
    budget: tuple[BudgetPeriod, ...] = ()
    outcomes: tuple[MarketingOutcome, ...] = ()
    assets: tuple[MarketingAsset, ...] = ()
    competitor_prices: tuple[CompetitorPrice, ...] = ()
    competitor_campaigns: tuple[CompetitorCampaign, ...] = ()
    trends: tuple[TrendPoint, ...] = ()
    events: tuple[MarketEvent, ...] = ()
    sources: tuple[SourceHealth, ...] = ()
    settings: GrowthSettings = field(default_factory=GrowthSettings)
    targets: GrowthTargets | None = None

    @property
    def today(self) -> date:
        return vn_date(self.taken_at)

    def item(self, sku: str) -> CatalogItem | None:
        return next((item for item in self.catalog if item.sku == sku), None)

    def sales_between(self, first: date, last: date) -> list[DailySales]:
        return [day for day in self.sales_daily if first <= day.day <= last]

    def sku_units(self, sku: str, days: int) -> int:
        """Units of `sku` sold over the last `days` days, today included."""
        first = self.today - timedelta(days=days - 1)
        return sum(row.units for row in self.sku_sales_daily if row.sku == sku and row.day >= first)

    def active_promotions(self) -> list[Promotion]:
        return [promotion for promotion in self.promotions if promotion.active]

    def latest_competitor_prices(self) -> list[CompetitorPrice]:
        """The freshest observation per (competitor, product page or SKU)."""
        latest: dict[tuple[str, str], CompetitorPrice] = {}
        for price in sorted(self.competitor_prices, key=lambda p: p.observed_at):
            latest[(price.competitor, price.url or price.sku or "")] = price
        return sorted(latest.values(), key=lambda p: (p.competitor, p.sku or "", p.url or ""))

    def watch_list(self) -> list[CompetitorPrice]:
        """Competitor pages the site collector should read (their latest observation asks to watch them)."""
        return [price for price in self.latest_competitor_prices() if price.watch and price.url]

    def upcoming_events(self, horizon_days: int) -> list[MarketEvent]:
        last = self.today + timedelta(days=horizon_days)
        return sorted(
            (event for event in self.events if event.ends_on >= self.today and event.starts_on <= last),
            key=lambda event: event.starts_on,
        )

    def trend_series(self, keyword: str) -> list[TrendPoint]:
        return sorted((point for point in self.trends if point.keyword == keyword), key=lambda point: point.day)


def by_sku(rows: Sequence[SkuDailySales]) -> dict[str, list[SkuDailySales]]:
    grouped: dict[str, list[SkuDailySales]] = {}
    for row in rows:
        grouped.setdefault(row.sku, []).append(row)
    return grouped
