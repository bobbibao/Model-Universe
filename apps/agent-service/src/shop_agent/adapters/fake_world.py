"""FakeWorld: the growth data of an in-memory shop, generated from a scenario (data/growth/scenarios/*.yaml).

It builds the same GrowthSnapshot shapes as `shop_db` reads from the web's views: daily and per-SKU sales history
(weekday rhythm, calendar events, a growth trend), competitors' prices and campaigns, search trends, the calendar,
the owner's settings, and this month's targets computed like `analytics.growth_targets`. Everything is deterministic
for a scenario's seed. Observations the collectors post are added to it.

For the growth simulation (`shop-agent simulate growth`), time moves on: `sell_day` adds one more day of sales with
the running discounts' true response (`response_uplift_per_pct`, which the agent never reads: it learns it), and a
scenario's `injections` put market events in on given days (a trend spike, a competitor undercut).
"""

from __future__ import annotations

import random
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field

from shop_agent.domain.growth.market import MarketObservations
from shop_agent.domain.growth.settings import GrowthSettings
from shop_agent.domain.growth.snapshot import (
    CatalogItem,
    CompetitorCampaign,
    CompetitorPrice,
    DailySales,
    GrowthSnapshot,
    GrowthTargets,
    MarketEvent,
    SkuDailySales,
    SourceHealth,
    TrendPoint,
    vn_date,
)
from shop_agent.domain.shop import StockItem

DATA_DIR = Path(__file__).resolve().parents[3] / "data"
SCENARIOS_DIR = DATA_DIR / "growth" / "scenarios"
CALENDAR = DATA_DIR / "market" / "events_vn.yaml"

# analytics.growth_targets (apps/web-ecommerce AnalyticsViews.ts), mirrored for the fake.
AUTO_TARGET_UPLIFT = 1.1
AUTO_AD_CAP_SHARE = 0.05
AUTO_AD_CAP_MAX_VND = 10_000_000


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class ScenarioProduct(_Model):
    sku: str
    name: str
    category: str
    price_vnd: int
    unit_cost_vnd: int
    quantity: int
    daily_units: float
    created_days_ago: int = 365


class ScenarioCampaign(_Model):
    title: str
    category: str | None = None
    discount_pct: float | None = None
    started_days_ago: int
    days: int


class ScenarioCompetitor(_Model):
    name: str
    website: str
    matched_skus: int
    undercut_skus: int = 0
    campaign: ScenarioCampaign | None = None


class ScenarioTrend(_Model):
    keyword: str
    category: str | None = None
    base: int
    spike_days: int = 0
    spike_factor: float = 1.0


class ScenarioInjection(_Model):
    """A market event the simulation puts in on `day` (1 is the first tick)."""

    day: int = Field(ge=1)
    kind: Literal["trend_spike", "competitor_undercut", "roas_breach"]
    keyword: str | None = None  # trend_spike: a mapped keyword
    factor: float = 1.8  # trend_spike: interest this week / last week; undercut: their price / ours is 1 - (f - 1)


class Scenario(_Model):
    name: str
    seed: int = 7
    history_days: int = 180
    weekday_factors: tuple[float, float, float, float, float, float, float] = (1, 1, 1, 1, 1, 1, 1)
    growth_over_history: float = 0.0
    event_uplift: dict[str, float] = Field(default_factory=dict)
    double_day_uplift: float = 1.0
    units_per_order: float = 1.4
    coupon_order_share: float = 0.2
    coupon_percent: float = 10
    attributed_order_share: float = 0.45
    catalog: tuple[ScenarioProduct, ...] = ()
    competitors: tuple[ScenarioCompetitor, ...] = ()
    price_weeks: int = 8
    undercut_factor: float = 0.85
    trends: tuple[ScenarioTrend, ...] = ()
    trend_days: int = 90
    settings: dict[str, Any] = Field(default_factory=dict)
    response_uplift_per_pct: float = 0.03  # the true extra units per 1% off (the agent's prior says 0.04)
    injections: tuple[ScenarioInjection, ...] = ()


def load_scenario(path: Path) -> Scenario:
    return Scenario.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))


def load_calendar(path: Path = CALENDAR) -> tuple[MarketEvent, ...]:
    events = yaml.safe_load(path.read_text(encoding="utf-8"))["events"]
    return tuple(
        MarketEvent(
            code=e["code"],
            name=e["name"],
            starts_on=e["starts_on"],
            ends_on=e["ends_on"],
            lead_days=e["lead_days"],
            categories=tuple(e["categories"]),
        )
        for e in events
    )


def _round_thousand(amount: float) -> int:
    return round(amount / 1000) * 1000


@dataclass
class FakeWorld:
    scenario: Scenario
    products: tuple[ScenarioProduct, ...]
    events: tuple[MarketEvent, ...]
    anchor: date  # the history ends the day before this one
    sales: list[SkuDailySales] = field(default_factory=list)
    competitor_prices: list[CompetitorPrice] = field(default_factory=list)
    competitor_campaigns: list[CompetitorCampaign] = field(default_factory=list)
    trends: dict[tuple[str, str, date], TrendPoint] = field(default_factory=dict)
    sources: dict[str, SourceHealth] = field(default_factory=dict)

    # -------------------------------------------------------------------------------------------- construction

    @classmethod
    def generate(
        cls,
        scenario: Scenario,
        now: datetime,
        products: Sequence[ScenarioProduct] | None = None,
        events: tuple[MarketEvent, ...] | None = None,
    ) -> FakeWorld:
        world = cls(
            scenario,
            tuple(products if products is not None else scenario.catalog),
            events if events is not None else load_calendar(),
            vn_date(now),
        )
        rng = random.Random(scenario.seed)  # noqa: S311 - simulation data, not security
        world._generate_sales(rng)
        world._generate_competitors(rng, now)
        world._generate_trends(rng)
        return world

    @classmethod
    def load(cls, name: str, now: datetime, products: Sequence[ScenarioProduct] | None = None) -> FakeWorld:
        """Reads files: call it outside the event loop (`asyncio.to_thread`)."""
        return cls.generate(load_scenario(SCENARIOS_DIR / f"{name}.yaml"), now, products)

    def _event_factor(self, day: date) -> float:
        factor = 1.0
        for event in self.events:
            if event.starts_on <= day <= event.ends_on:
                uplift = self.scenario.event_uplift.get(event.code)
                if uplift is None and event.code.startswith("double_"):
                    uplift = self.scenario.double_day_uplift
                factor = max(factor, uplift or 1.0)
        return factor

    def _generate_sales(self, rng: random.Random) -> None:
        days = self.scenario.history_days
        for age in range(days, 0, -1):
            day = self.anchor - timedelta(days=age)
            trend = 1 + self.scenario.growth_over_history * (days - age) / max(days - 1, 1)
            factor = self.scenario.weekday_factors[day.weekday()] * self._event_factor(day) * trend
            for product in self.products:
                if age > product.created_days_ago:
                    continue
                expected = product.daily_units * factor
                units = int(expected) + (1 if rng.random() < expected - int(expected) else 0)
                if units:
                    self.sales.append(SkuDailySales(day, product.sku, units, units * product.price_vnd))

    def _generate_competitors(self, rng: random.Random, now: datetime) -> None:
        sellable = [product for product in self.products if product.daily_units > 0]
        for competitor in self.scenario.competitors:
            matched = rng.sample(sellable, k=min(competitor.matched_skus, len(sellable)))
            for index, product in enumerate(matched):
                base = rng.uniform(0.92, 1.1)
                for week in range(self.scenario.price_weeks - 1, -1, -1):
                    undercut = week == 0 and index < competitor.undercut_skus
                    factor = self.scenario.undercut_factor if undercut else base * rng.uniform(0.98, 1.02)
                    self.competitor_prices.append(
                        CompetitorPrice(
                            competitor=competitor.name,
                            competitor_website=competitor.website,
                            sku=product.sku,
                            url=f"{competitor.website}/products/{product.sku.lower()}",
                            watch=False,
                            source="manual",
                            title=product.name,
                            price_vnd=_round_thousand(product.price_vnd * factor),
                            observed_at=now - timedelta(days=week * 7 + 1),
                            confidence=1.0,
                        )
                    )
            if competitor.campaign:
                started = now - timedelta(days=competitor.campaign.started_days_ago)
                self.competitor_campaigns.append(
                    CompetitorCampaign(
                        competitor=competitor.name,
                        title=competitor.campaign.title,
                        category=competitor.campaign.category,
                        discount_pct=competitor.campaign.discount_pct,
                        starts_at=started,
                        ends_at=started + timedelta(days=competitor.campaign.days),
                        url=f"{competitor.website}/khuyen-mai",
                        source="manual",
                        observed_at=started,
                    )
                )

    def _generate_trends(self, rng: random.Random) -> None:
        for trend in self.scenario.trends:
            for age in range(self.scenario.trend_days, 0, -1):
                day = self.anchor - timedelta(days=age)
                spike = trend.spike_factor if age <= trend.spike_days else 1.0
                weekend = 1.1 if day.weekday() >= 5 else 1.0
                interest = min(100, round(trend.base * spike * weekend * rng.uniform(0.9, 1.1)))
                self.trends[(trend.keyword, "VN", day)] = TrendPoint(trend.keyword, "VN", day, interest, "fixture")

    # -------------------------------------------------------------------------------------------- simulation

    def sell_day(self, day: date, discounts: Mapping[str, float], stock: Mapping[str, int]) -> dict[str, int]:
        """One more day of sales after the history: its rhythm, with the true response to the running discounts."""
        rng = random.Random(f"{self.scenario.seed}:{day.isoformat()}")  # noqa: S311 - simulation data
        factor = self.scenario.weekday_factors[day.weekday()] * self._event_factor(day)
        factor *= 1 + self.scenario.growth_over_history
        sold: dict[str, int] = {}
        for product in self.products:
            percent = discounts.get(product.sku, 0.0)
            expected = product.daily_units * factor * (1 + self.scenario.response_uplift_per_pct * percent)
            units = int(expected) + (1 if rng.random() < expected - int(expected) else 0)
            units = min(units, stock.get(product.sku, 0))
            if units:
                revenue = round(units * product.price_vnd * (1 - percent / 100))
                self.sales.append(SkuDailySales(day, product.sku, units, revenue))
                sold[product.sku] = units
        return sold

    def spike_trend(self, keyword: str, factor: float, today: date) -> None:
        """The keyword's interest over the last 14 days: flat, then `factor` times higher this week."""
        base = next((t.base for t in self.scenario.trends if t.keyword == keyword), 50)
        for age in range(14, 0, -1):
            day = today - timedelta(days=age)
            interest = min(100, round(base * (factor if age <= 7 else 1.0)))
            self.trends[(keyword, "VN", day)] = TrendPoint(keyword, "VN", day, interest, "fixture")

    def undercut(self, sku: str, price_vnd: int, now: datetime) -> None:
        """A competitor's fresh, lower price on one of our SKUs."""
        competitor = self.scenario.competitors[0]
        self.competitor_prices.append(
            CompetitorPrice(
                competitor=competitor.name,
                competitor_website=competitor.website,
                sku=sku,
                url=f"{competitor.website}/products/{sku.lower()}",
                watch=False,
                source="manual",
                title=sku,
                price_vnd=price_vnd,
                observed_at=now - timedelta(hours=1),
                confidence=1.0,
            )
        )

    # -------------------------------------------------------------------------------------------- reads

    def daily_sales(self) -> tuple[DailySales, ...]:
        by_day: dict[date, list[SkuDailySales]] = {}
        for row in self.sales:
            by_day.setdefault(row.day, []).append(row)
        costs = {product.sku: product.unit_cost_vnd for product in self.products}
        result = []
        share, percent = self.scenario.coupon_order_share, self.scenario.coupon_percent
        for day in sorted(by_day):
            rows = by_day[day]
            units = sum(row.units for row in rows)
            revenue = sum(row.revenue_vnd for row in rows)
            coupons = round(revenue * share * percent / 100)
            margin = sum(row.revenue_vnd - row.units * costs.get(row.sku, 0) for row in rows)
            orders = max(1, round(units / self.scenario.units_per_order))
            result.append(
                DailySales(
                    day=day,
                    orders=orders,
                    units=units,
                    revenue_vnd=revenue - coupons,
                    coupon_discount_vnd=coupons,
                    gross_profit_vnd=margin - coupons,
                    attributed_orders=round(orders * self.scenario.attributed_order_share),
                )
            )
        return tuple(result)

    def targets(self, today: date, sales: Sequence[DailySales], settings: GrowthSettings) -> GrowthTargets:
        """analytics.growth_targets, computed the same way."""
        month = today.replace(day=1)
        monthly: dict[date, int] = {}
        for day in sales:
            key = day.day.replace(day=1)
            monthly[key] = monthly.get(key, 0) + day.revenue_vnd
        complete = {m: v for m, v in monthly.items() if m < month}

        def months_before(n: int) -> date:
            index = month.year * 12 + month.month - 1 - n
            return date(index // 12, index % 12 + 1, 1)

        trailing_values = [v for m, v in complete.items() if m >= months_before(3)]
        trailing = round(sum(trailing_values) / len(trailing_values)) if trailing_values else None
        last_year = complete.get(months_before(12))
        goal, caps = settings.goal, settings.caps
        if goal.revenue_target_vnd != "auto":
            target, source = goal.revenue_target_vnd, "owner"
        elif len(complete) >= 12 and last_year is not None:
            target, source = round(last_year * AUTO_TARGET_UPLIFT), "auto_last_year"
        elif trailing is not None:
            target, source = round(trailing * AUTO_TARGET_UPLIFT), "auto_trailing_3m"
        else:
            target, source = None, "none"
        if caps.monthly_ad_cap_vnd != "auto":
            cap, cap_source = caps.monthly_ad_cap_vnd, "owner"
        else:
            cap = min(AUTO_AD_CAP_MAX_VND, round((trailing or 0) * AUTO_AD_CAP_SHARE))
            cap_source = "auto" if trailing is not None else "none"
        return GrowthTargets(month, trailing, target, source, cap, cap_source)

    def snapshot(self, now: datetime, catalog: Sequence[CatalogItem] | None = None) -> GrowthSnapshot:
        settings = GrowthSettings.from_values(self.scenario.settings)
        sales = self.daily_sales()
        items = tuple(catalog) if catalog is not None else self._catalog(now)
        return GrowthSnapshot(
            taken_at=now,
            sales_daily=sales,
            sku_sales_daily=tuple(self.sales),
            catalog=items,
            competitor_prices=tuple(self.competitor_prices),
            competitor_campaigns=tuple(self.competitor_campaigns),
            trends=tuple(sorted(self.trends.values(), key=lambda p: (p.keyword, p.day))),
            events=self.events,
            sources=tuple(self.sources.values()),
            settings=settings,
            targets=self.targets(vn_date(now), sales, settings),
        )

    def _catalog(self, now: datetime) -> tuple[CatalogItem, ...]:
        return tuple(
            CatalogItem(
                sku=p.sku,
                name=p.name,
                brand="",
                category=p.category,
                category_name=p.category,
                price_vnd=p.price_vnd,
                sale_price_vnd=p.price_vnd,
                discount_pct=0.0,
                unit_cost_vnd=p.unit_cost_vnd,
                quantity=p.quantity,
                inventory_status="available",
                sales_channel="web",
                is_archived=False,
                created_at=now - timedelta(days=p.created_days_ago),
            )
            for p in self.products
        )

    # -------------------------------------------------------------------------------------------- collector posts

    def record(self, observations: MarketObservations, now: datetime) -> str:
        """What the web does with `POST /market/observations`."""
        for point in observations.trends:
            self.trends[(point.keyword, point.geo, point.date)] = TrendPoint(
                point.keyword, point.geo, point.date, point.interest, observations.source
            )
        for price in observations.competitor_prices:
            self.competitor_prices.append(
                CompetitorPrice(
                    competitor=price.competitor,
                    competitor_website=None,
                    sku=price.sku,
                    url=price.url,
                    watch=observations.source == "competitor_sites",
                    source="scraper" if observations.source == "competitor_sites" else "fixture",
                    title=price.title,
                    price_vnd=price.price_vnd,
                    observed_at=price.observed_at or observations.observed_at,
                    confidence=price.confidence,
                )
            )
        for campaign in observations.competitor_campaigns:
            self.competitor_campaigns.append(
                CompetitorCampaign(
                    competitor=campaign.competitor,
                    title=campaign.title,
                    category=campaign.category,
                    discount_pct=campaign.discount_pct,
                    starts_at=campaign.starts_at,
                    ends_at=campaign.ends_at,
                    url=campaign.url,
                    source="scraper" if observations.source == "competitor_sites" else "fixture",
                    observed_at=observations.observed_at,
                )
            )
        previous = self.sources.get(observations.source)
        self.sources[observations.source] = SourceHealth(
            name=observations.source,
            status=observations.status,
            detail=observations.detail,
            last_run_at=now,
            last_success_at=now if observations.status == "ok" else (previous.last_success_at if previous else None),
        )
        return (
            f"{observations.source} ({observations.status}): {len(observations.trends)} trend points, "
            f"{len(observations.competitor_prices)} prices, {len(observations.competitor_campaigns)} campaigns"
        )


def products_from(items: Mapping[str, StockItem], daily: Mapping[str, float]) -> list[ScenarioProduct]:
    """A FakeShop's stock as scenario products (the growth history then describes the same shop)."""
    return [
        ScenarioProduct(
            sku=item.sku,
            name=item.name,
            category=item.category,
            price_vnd=item.unit_price_vnd,
            unit_cost_vnd=item.unit_cost_vnd,
            quantity=item.quantity,
            daily_units=daily.get(item.sku, 0.0),
            created_days_ago=max(item.days_in_stock, 1),
        )
        for item in items.values()
    ]
