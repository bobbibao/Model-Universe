"""Market detectors: `competitor_undercut`, `competitor_campaign`, `trend_spike` and `seasonal_event`.

Competitor titles and campaign texts are untrusted data: they are carried as evidence values, never as instructions.
"""

from __future__ import annotations

from datetime import timedelta
from statistics import mean

from shop_agent.domain.growth.defaults import GrowthDefaults
from shop_agent.domain.growth.demand import sellable_items, units_between, velocity, window
from shop_agent.domain.growth.detectors.base import MAX_SKUS, week_bucket
from shop_agent.domain.growth.snapshot import GrowthSnapshot, vn_date
from shop_agent.domain.models import Opportunity, Severity, make_fingerprint
from shop_agent.domain.money import format_vnd

ACTIVE_CAMPAIGN_STATUSES = ("draft", "active", "paused")


class CompetitorUndercutDetector:
    """A fresh competitor price at least `undercut_pct` below ours, on SKUs that sold in the last 30 days."""

    kind = "competitor_undercut"

    def detect(self, snapshot: GrowthSnapshot, defaults: GrowthDefaults) -> list[Opportunity]:
        d = defaults.detectors
        fresh_after = snapshot.taken_at - timedelta(hours=d.undercut_fresh_hours)
        first, last = window(snapshot, d.undercut_sales_days)
        gaps: dict[str, tuple[float, str, int]] = {}
        for price in snapshot.latest_competitor_prices():
            item = snapshot.item(price.sku) if price.sku else None
            if item is None or not item.sellable or price.observed_at < fresh_after:
                continue
            if units_between(snapshot, [item.sku], first, last) <= 0:
                continue
            gap = (item.sale_price_vnd - price.price_vnd) / item.sale_price_vnd * 100
            if gap >= d.undercut_pct and gap > gaps.get(item.sku, (0.0, "", 0))[0]:
                gaps[item.sku] = (gap, price.competitor, price.price_vnd)
        if not gaps:
            return []
        ranked = sorted(gaps.items(), key=lambda kv: (-kv[1][0], kv[0]))[:MAX_SKUS]
        skus = tuple(sku for sku, _ in ranked)
        worst_sku, (worst, competitor, their_price) = ranked[0]
        return [
            Opportunity(
                kind=self.kind,
                fingerprint=make_fingerprint(self.kind, skus, week_bucket(snapshot.today)),
                severity=Severity.HIGH if worst >= 15 else Severity.MEDIUM,
                title=f"Đối thủ bán rẻ hơn ở {len(skus)} mã",
                summary=(
                    f"Giá đối thủ thấp hơn giá bán của shop từ {d.undercut_pct:.0f}% trở lên; "
                    f"chênh nhiều nhất {worst:.0f}% ở {worst_sku} ({format_vnd(their_price)})."
                ),
                evidence={
                    "max_gap_pct": round(worst, 1),
                    "competitor": competitor,
                    "worst_sku": worst_sku,
                    "competitor_price_vnd": their_price,
                },
                skus=skus,
                detected_at=snapshot.taken_at,
            )
        ]


class CompetitorCampaignDetector:
    """A competitor campaign running now in one of our categories."""

    kind = "competitor_campaign"

    def detect(self, snapshot: GrowthSnapshot, defaults: GrowthDefaults) -> list[Opportunity]:
        now = snapshot.taken_at
        ours = {item.category: item for item in sellable_items(snapshot)}
        found = []
        seen: set[tuple[str, str]] = set()
        for campaign in snapshot.competitor_campaigns:
            if campaign.category not in ours or (campaign.competitor, campaign.title) in seen:
                continue
            started = campaign.starts_at or campaign.observed_at
            if started > now or (campaign.ends_at is not None and campaign.ends_at < now):
                continue
            if campaign.ends_at is None and campaign.observed_at < now - timedelta(days=14):
                continue
            seen.add((campaign.competitor, campaign.title))
            category_items = [i for i in sellable_items(snapshot) if i.category == campaign.category]
            top = sorted(category_items, key=lambda i: (-velocity(snapshot, [i.sku], 28), i.sku))[:MAX_SKUS]
            discount = campaign.discount_pct or 0
            found.append(
                Opportunity(
                    kind=self.kind,
                    fingerprint=make_fingerprint(
                        self.kind, [campaign.competitor, campaign.title], f"{vn_date(started):%Y-%m-%d}"
                    ),
                    severity=Severity.HIGH if discount >= 30 else Severity.MEDIUM,
                    title=f"Đối thủ đang khuyến mãi nhóm {ours[campaign.category].category_name}",
                    summary=(
                        "Một đối thủ đang chạy khuyến mãi"
                        + (f" giảm {discount:g}%" if discount else "")
                        + f" ở nhóm {ours[campaign.category].category_name}"
                        + (f" đến {vn_date(campaign.ends_at):%d/%m}" if campaign.ends_at else "")
                        + "."
                    ),
                    evidence={
                        "competitor": campaign.competitor,
                        "campaign_title": campaign.title,
                        "category": campaign.category,
                        "discount_pct": discount,
                    },
                    skus=tuple(i.sku for i in top),
                    detected_at=now,
                )
            )
        return found


class TrendSpikeDetector:
    """Search interest for a mapped keyword up `trend_spike_pct` week over week, with stock in its category."""

    kind = "trend_spike"

    def detect(self, snapshot: GrowthSnapshot, defaults: GrowthDefaults) -> list[Opportunity]:
        d = defaults.detectors
        found = []
        for mapping in snapshot.settings.trend_keywords:
            series = snapshot.trend_series(mapping.keyword)
            if len(series) < 14 or series[-1].day < snapshot.today - timedelta(days=d.trend_fresh_days):
                continue
            recent = mean(p.interest for p in series[-7:])
            before = mean(p.interest for p in series[-14:-7])
            if before <= 0 or (recent - before) / before * 100 < d.trend_spike_pct:
                continue
            items = [i for i in sellable_items(snapshot) if mapping.category is None or i.category == mapping.category]
            if not items:
                continue
            top = sorted(items, key=lambda i: (-velocity(snapshot, [i.sku], 28), i.sku))[:MAX_SKUS]
            change = (recent - before) / before * 100
            found.append(
                Opportunity(
                    kind=self.kind,
                    fingerprint=make_fingerprint(self.kind, [mapping.keyword], week_bucket(snapshot.today)),
                    severity=Severity.HIGH if change >= 80 else Severity.MEDIUM,
                    title=f'Lượt tìm kiếm "{mapping.keyword}" tăng {change:.0f}%',
                    summary=(
                        f"Mức quan tâm 7 ngày qua là {recent:.0f}, tuần trước {before:.0f} (Google Trends); "
                        f"shop còn {sum(i.quantity for i in items)} sản phẩm trong nhóm liên quan."
                    ),
                    evidence={
                        "keyword": mapping.keyword,
                        "category": mapping.category or "",
                        "interest_7d": round(recent, 1),
                        "interest_prev_7d": round(before, 1),
                        "change_pct": round(change, 1),
                    },
                    skus=tuple(i.sku for i in top),
                    detected_at=snapshot.taken_at,
                )
            )
        return found


class SeasonalEventDetector:
    """A calendar event inside its lead window with no agent campaign planned for it."""

    kind = "seasonal_event"

    def detect(self, snapshot: GrowthSnapshot, defaults: GrowthDefaults) -> list[Opportunity]:
        today = snapshot.today
        found = []
        for event in snapshot.events:
            lead = event.lead_days or defaults.detectors.seasonal_lead_days
            if not today <= event.starts_on <= today + timedelta(days=lead):
                continue
            planned = any(
                c.status in ACTIVE_CAMPAIGN_STATUSES
                and c.starts_at is not None
                and vn_date(c.starts_at) <= event.ends_on
                and (c.ends_at is None or vn_date(c.ends_at) >= today)
                for c in snapshot.campaigns
            )
            if planned:
                continue
            categories = set(event.categories)
            items = [i for i in sellable_items(snapshot) if not categories or i.category in categories]
            top = sorted(items, key=lambda i: (-velocity(snapshot, [i.sku], 28), i.sku))[:MAX_SKUS]
            days_left = (event.starts_on - today).days
            found.append(
                Opportunity(
                    kind=self.kind,
                    fingerprint=make_fingerprint(self.kind, [event.code], f"{event.starts_on:%Y}"),
                    severity=Severity.HIGH if days_left <= 7 else Severity.MEDIUM,
                    title=f"Sắp đến {event.name}",
                    summary=(
                        f"{event.name} bắt đầu sau {days_left} ngày ({event.starts_on:%d/%m}); "
                        "chưa có chiến dịch nào cho dịp này."
                    ),
                    evidence={
                        "event_code": event.code,
                        "event_name": event.name,
                        "starts_on": event.starts_on.isoformat(),
                        "ends_on": event.ends_on.isoformat(),
                        "days_left": days_left,
                    },
                    skus=tuple(i.sku for i in top),
                    detected_at=snapshot.taken_at,
                )
            )
        return found
