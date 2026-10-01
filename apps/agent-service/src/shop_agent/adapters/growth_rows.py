"""The growth views (apps/web-ecommerce AnalyticsViews.ts) as SQL with explicit columns, and their rows as domain types.

Explicit columns make a renamed or missing column fail loudly (`shop-agent snapshot --check`). Pure mapping, shared by
`ShopDb` and the tests.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date, datetime
from typing import Any

from shop_agent.domain.growth.settings import GrowthSettings
from shop_agent.domain.growth.snapshot import (
    Ad,
    AdDailyMetrics,
    BudgetPeriod,
    CatalogItem,
    CompetitorCampaign,
    CompetitorPrice,
    DailySales,
    GrowthSnapshot,
    GrowthTargets,
    MarketEvent,
    MarketingAsset,
    MarketingCampaign,
    MarketingOutcome,
    Post,
    PostDailyMetrics,
    Promotion,
    SkuDailySales,
    SourceHealth,
    TrendPoint,
)

HISTORY_DAYS = 400  # sales history read: 12 complete months plus the current one

Row = Mapping[str, Any]

# View -> the columns the agent reads. The order of GROWTH_VIEWS is the order of the queries.
GROWTH_VIEWS: dict[str, tuple[str, ...]] = {
    "sales_daily": (
        "day",
        "orders",
        "units",
        "revenue_vnd",
        "coupon_discount_vnd",
        "gross_profit_vnd",
        "attributed_orders",
    ),
    "sku_sales_daily": ("day", "sku", "units", "revenue_vnd"),
    "catalog": (
        "sku",
        "name",
        "brand",
        "description",
        "category",
        "category_name",
        "price_vnd",
        "sale_price_vnd",
        "discount_pct",
        "unit_cost_vnd",
        "quantity",
        "inventory_status",
        "sales_channel",
        "is_archived",
        "created_at",
        "last_received_at",
    ),
    "promotions": (
        "kind",
        "ref",
        "sku",
        "percent",
        "starts_at",
        "ends_at",
        "revoked_at",
        "source",
        "campaign_ref",
        "min_order_vnd",
        "usage_limit",
        "usage_count",
        "active",
        "action_key",
    ),
    "marketing_campaigns": (
        "ref",
        "kind",
        "objective",
        "thread_id",
        "status",
        "starts_at",
        "ends_at",
        "budget_vnd",
        "utm_campaign",
    ),
    "marketing_ads": (
        "ref",
        "campaign_ref",
        "platform",
        "status",
        "objective",
        "daily_budget_vnd",
        "total_budget_vnd",
        "starts_at",
        "ends_at",
        "activated_at",
    ),
    "marketing_posts": ("ref", "campaign_ref", "platform", "status", "scheduled_at", "published_at"),
    "ad_performance_daily": (
        "ad_ref",
        "campaign_ref",
        "platform",
        "date",
        "impressions",
        "clicks",
        "spend_vnd",
        "conversions",
        "conversion_value_vnd",
        "ad_status",
        "objective",
    ),
    "post_performance_daily": (
        "post_ref",
        "campaign_ref",
        "date",
        "impressions",
        "reach",
        "engagements",
        "clicks",
        "published_at",
    ),
    "marketing_budget": ("period", "cap_vnd", "reserved_vnd", "spent_vnd", "remaining_vnd"),
    "marketing_outcomes": (
        "thread_id",
        "campaign_ref",
        "capability",
        "verdict",
        "incremental_revenue_vnd",
        "incremental_profit_vnd",
        "spend_vnd",
        "confidence",
        "measured_at",
    ),
    "marketing_assets": ("asset_id", "kind", "url", "title", "sku", "created_at"),
    "market_competitor_prices": (
        "competitor",
        "competitor_website",
        "sku",
        "url",
        "watch",
        "source",
        "title",
        "price_vnd",
        "observed_at",
        "confidence",
    ),
    "market_competitor_campaigns": (
        "competitor",
        "title",
        "category",
        "discount_pct",
        "starts_at",
        "ends_at",
        "url",
        "source",
        "observed_at",
    ),
    "market_trends": ("keyword", "geo", "date", "interest", "source"),
    "market_events": ("code", "name", "starts_on", "ends_on", "lead_days", "categories"),
    "market_sources": ("name", "status", "detail", "last_run_at", "last_success_at"),
    "agent_settings": ("key", "value", "version"),
    "orders_attributed": ("order_id", "ordered_at", "total_vnd", "campaign_ref", "utm_source", "click_id_type"),
    "growth_targets": (
        "month",
        "trailing_monthly_revenue_vnd",
        "revenue_target_vnd",
        "revenue_target_source",
        "monthly_ad_cap_vnd",
        "monthly_ad_cap_source",
    ),
}

# Views read in full; the sales views are read from `since` on.
_SINCE = {
    "sales_daily": "day",
    "sku_sales_daily": "day",
    "ad_performance_daily": "date",
    "post_performance_daily": "date",
    "market_trends": "date",
}
# orders_attributed is only checked (its rows are per order); the snapshot does not carry it.
SNAPSHOT_VIEWS = tuple(view for view in GROWTH_VIEWS if view != "orders_attributed")


def view_sql(view: str) -> str:
    columns = ", ".join(GROWTH_VIEWS[view])
    sql = f"SELECT {columns} FROM analytics.{view}"  # noqa: S608 - fixed names from GROWTH_VIEWS
    return f"{sql} WHERE {_SINCE[view]} >= %s" if view in _SINCE else sql


def check_sql(view: str) -> str:
    """Selects the view's columns without rows: fails on a missing view or column."""
    return f"SELECT {', '.join(GROWTH_VIEWS[view])} FROM analytics.{view} LIMIT 0"  # noqa: S608


def _int(value: Any) -> int:
    return int(value or 0)


def _opt_int(value: Any) -> int | None:
    return None if value is None else int(value)


def _day(value: Any) -> date:
    return value.date() if isinstance(value, datetime) else value


def to_growth_snapshot(now: datetime, rows: Mapping[str, Sequence[Row]]) -> GrowthSnapshot:
    """`rows`: view name -> its rows, for SNAPSHOT_VIEWS."""
    settings = GrowthSettings.from_values({str(r["key"]): r["value"] for r in rows["agent_settings"]})
    targets = [
        GrowthTargets(
            month=_day(r["month"]),
            trailing_monthly_revenue_vnd=_opt_int(r["trailing_monthly_revenue_vnd"]),
            revenue_target_vnd=_opt_int(r["revenue_target_vnd"]),
            revenue_target_source=str(r["revenue_target_source"]),
            monthly_ad_cap_vnd=_int(r["monthly_ad_cap_vnd"]),
            monthly_ad_cap_source=str(r["monthly_ad_cap_source"]),
        )
        for r in rows["growth_targets"]
    ]
    return GrowthSnapshot(
        taken_at=now,
        sales_daily=tuple(
            DailySales(
                day=_day(r["day"]),
                orders=_int(r["orders"]),
                units=_int(r["units"]),
                revenue_vnd=_int(r["revenue_vnd"]),
                coupon_discount_vnd=_int(r["coupon_discount_vnd"]),
                gross_profit_vnd=_int(r["gross_profit_vnd"]),
                attributed_orders=_int(r["attributed_orders"]),
            )
            for r in rows["sales_daily"]
        ),
        sku_sales_daily=tuple(
            SkuDailySales(
                day=_day(r["day"]), sku=str(r["sku"]), units=_int(r["units"]), revenue_vnd=_int(r["revenue_vnd"])
            )
            for r in rows["sku_sales_daily"]
        ),
        catalog=tuple(
            CatalogItem(
                sku=str(r["sku"]),
                name=str(r["name"]),
                brand=str(r["brand"] or ""),
                category=str(r["category"]),
                category_name=str(r["category_name"]),
                price_vnd=_int(r["price_vnd"]),
                sale_price_vnd=_int(r["sale_price_vnd"]),
                discount_pct=float(r["discount_pct"] or 0),
                unit_cost_vnd=_int(r["unit_cost_vnd"]),
                quantity=_int(r["quantity"]),
                inventory_status=str(r["inventory_status"]),
                sales_channel=str(r["sales_channel"]),
                is_archived=bool(r["is_archived"]),
                created_at=r["created_at"],
                description=str(r["description"] or ""),
                last_received_at=r["last_received_at"],
            )
            for r in rows["catalog"]
        ),
        promotions=tuple(
            Promotion(
                kind=str(r["kind"]),
                ref=str(r["ref"]),
                sku=r["sku"],
                percent=float(r["percent"]),
                starts_at=r["starts_at"],
                ends_at=r["ends_at"],
                revoked_at=r["revoked_at"],
                source=str(r["source"]),
                campaign_ref=r["campaign_ref"],
                min_order_vnd=_int(r["min_order_vnd"]),
                usage_limit=_opt_int(r["usage_limit"]),
                usage_count=_opt_int(r["usage_count"]),
                active=bool(r["active"]),
                action_key=r["action_key"],
            )
            for r in rows["promotions"]
        ),
        campaigns=tuple(
            MarketingCampaign(
                ref=str(r["ref"]),
                kind=str(r["kind"]),
                objective=str(r["objective"]),
                thread_id=r["thread_id"],
                status=str(r["status"]),
                starts_at=r["starts_at"],
                ends_at=r["ends_at"],
                budget_vnd=_int(r["budget_vnd"]),
                utm_campaign=str(r["utm_campaign"]),
            )
            for r in rows["marketing_campaigns"]
        ),
        ads=tuple(
            Ad(
                ref=str(r["ref"]),
                campaign_ref=r["campaign_ref"],
                platform=str(r["platform"]),
                status=str(r["status"]),
                objective=str(r["objective"]),
                daily_budget_vnd=_int(r["daily_budget_vnd"]),
                total_budget_vnd=_int(r["total_budget_vnd"]),
                starts_at=r["starts_at"],
                ends_at=r["ends_at"],
                activated_at=r["activated_at"],
            )
            for r in rows["marketing_ads"]
        ),
        posts=tuple(
            Post(
                ref=str(r["ref"]),
                campaign_ref=r["campaign_ref"],
                platform=str(r["platform"]),
                status=str(r["status"]),
                scheduled_at=r["scheduled_at"],
                published_at=r["published_at"],
            )
            for r in rows["marketing_posts"]
        ),
        ad_metrics=tuple(
            AdDailyMetrics(
                ad_ref=str(r["ad_ref"]),
                campaign_ref=r["campaign_ref"],
                platform=str(r["platform"]),
                day=_day(r["date"]),
                impressions=_int(r["impressions"]),
                clicks=_int(r["clicks"]),
                spend_vnd=_int(r["spend_vnd"]),
                conversions=_int(r["conversions"]),
                conversion_value_vnd=_int(r["conversion_value_vnd"]),
                ad_status=r["ad_status"],
                objective=r["objective"],
            )
            for r in rows["ad_performance_daily"]
        ),
        post_metrics=tuple(
            PostDailyMetrics(
                post_ref=str(r["post_ref"]),
                campaign_ref=r["campaign_ref"],
                day=_day(r["date"]),
                impressions=_int(r["impressions"]),
                reach=_int(r["reach"]),
                engagements=_int(r["engagements"]),
                clicks=_int(r["clicks"]),
                published_at=r["published_at"],
            )
            for r in rows["post_performance_daily"]
        ),
        budget=tuple(
            BudgetPeriod(
                period=str(r["period"]),
                cap_vnd=_int(r["cap_vnd"]),
                reserved_vnd=_int(r["reserved_vnd"]),
                spent_vnd=_int(r["spent_vnd"]),
                remaining_vnd=_int(r["remaining_vnd"]),
            )
            for r in rows["marketing_budget"]
        ),
        outcomes=tuple(
            MarketingOutcome(
                thread_id=str(r["thread_id"]),
                campaign_ref=r["campaign_ref"],
                capability=str(r["capability"]),
                verdict=str(r["verdict"]),
                incremental_revenue_vnd=_int(r["incremental_revenue_vnd"]),
                incremental_profit_vnd=_int(r["incremental_profit_vnd"]),
                spend_vnd=_int(r["spend_vnd"]),
                confidence=None if r["confidence"] is None else float(r["confidence"]),
                measured_at=r["measured_at"],
            )
            for r in rows["marketing_outcomes"]
        ),
        assets=tuple(
            MarketingAsset(
                asset_id=_int(r["asset_id"]),
                kind=str(r["kind"]),
                url=str(r["url"]),
                title=str(r["title"]),
                sku=r["sku"],
                created_at=r["created_at"],
            )
            for r in rows["marketing_assets"]
        ),
        competitor_prices=tuple(
            CompetitorPrice(
                competitor=str(r["competitor"]),
                competitor_website=r["competitor_website"],
                sku=r["sku"],
                url=r["url"],
                watch=bool(r["watch"]),
                source=str(r["source"]),
                title=r["title"],
                price_vnd=_int(r["price_vnd"]),
                observed_at=r["observed_at"],
                confidence=float(r["confidence"]),
            )
            for r in rows["market_competitor_prices"]
        ),
        competitor_campaigns=tuple(
            CompetitorCampaign(
                competitor=str(r["competitor"]),
                title=str(r["title"]),
                category=r["category"],
                discount_pct=None if r["discount_pct"] is None else float(r["discount_pct"]),
                starts_at=r["starts_at"],
                ends_at=r["ends_at"],
                url=r["url"],
                source=str(r["source"]),
                observed_at=r["observed_at"],
            )
            for r in rows["market_competitor_campaigns"]
        ),
        trends=tuple(
            TrendPoint(
                keyword=str(r["keyword"]),
                geo=str(r["geo"]),
                day=_day(r["date"]),
                interest=_int(r["interest"]),
                source=str(r["source"]),
            )
            for r in rows["market_trends"]
        ),
        events=tuple(
            MarketEvent(
                code=str(r["code"]),
                name=str(r["name"]),
                starts_on=_day(r["starts_on"]),
                ends_on=_day(r["ends_on"]),
                lead_days=_int(r["lead_days"]),
                categories=tuple(str(c) for c in (r["categories"] or ())),
            )
            for r in rows["market_events"]
        ),
        sources=tuple(
            SourceHealth(
                name=str(r["name"]),
                status=str(r["status"]),
                detail=r["detail"],
                last_run_at=r["last_run_at"],
                last_success_at=r["last_success_at"],
            )
            for r in rows["market_sources"]
        ),
        settings=settings,
        targets=targets[0] if targets else None,
    )
