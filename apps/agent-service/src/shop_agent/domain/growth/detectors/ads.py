"""Paid-ads detectors: `campaign_scaling` (a campaign earning well with room to spend more) and `bidding_upgrade`
(enough purchases to optimise for them, docs/GROWTH_AGENT.md section 6)."""

from __future__ import annotations

from datetime import timedelta

from shop_agent.domain.growth.defaults import BiddingDefaults, GrowthDefaults
from shop_agent.domain.growth.detectors.base import week_bucket
from shop_agent.domain.growth.snapshot import ConversionStats, GrowthSnapshot
from shop_agent.domain.models import Opportunity, Severity, make_fingerprint


def bidding_switch(platform: str, stats: ConversionStats | None, defaults: BiddingDefaults) -> bool:
    """Whether ads on `platform` may move from clicks to purchases: Meta and TikTok at 50 purchases in 7 days (their
    learning phase), Google at 30 conversions in 30 days."""
    if stats is None:
        return False
    if platform == "google":
        return stats.purchases_30d >= defaults.google_conversions_30d
    needed = defaults.meta_purchases_7d if platform == "meta" else defaults.tiktok_purchases_7d
    return stats.purchases_7d >= needed


class CampaignScalingDetector:
    """A delivering ad whose ROAS over the lookback is at least `scaling_roas`, with budget left in the month."""

    kind = "campaign_scaling"

    def detect(self, snapshot: GrowthSnapshot, defaults: GrowthDefaults) -> list[Opportunity]:
        d = defaults.detectors
        budget = snapshot.budget[-1] if snapshot.budget else None
        if budget is None or budget.remaining_vnd < defaults.prioritize.min_ad_budget_vnd:
            return []
        first = snapshot.today - timedelta(days=d.scaling_lookback_days)
        found = []
        for ad in snapshot.ads:
            if ad.status != "active":
                continue
            rows = [m for m in snapshot.ad_metrics if m.ad_ref == ad.ref and m.day >= first]
            spend = sum(m.spend_vnd for m in rows)
            value = sum(m.conversion_value_vnd for m in rows)
            if spend <= 0 or value / spend < d.scaling_roas:
                continue
            found.append(
                Opportunity(
                    kind=self.kind,
                    fingerprint=make_fingerprint(self.kind, [ad.ref], week_bucket(snapshot.today)),
                    severity=Severity.MEDIUM,
                    title=f"Quảng cáo {ad.ref} đang hiệu quả",
                    summary=(
                        f"ROAS {value / spend:.1f} trong {d.scaling_lookback_days} ngày qua "
                        f"(mục tiêu {d.scaling_roas:g}); ngân sách tháng còn {budget.remaining_vnd} VND."
                    ),
                    evidence={
                        "ad_ref": ad.ref,
                        "platform": ad.platform,
                        "roas": round(value / spend, 2),
                        "daily_budget_vnd": ad.daily_budget_vnd,
                        "remaining_vnd": budget.remaining_vnd,
                    },
                    detected_at=snapshot.taken_at,
                )
            )
        return found


class BiddingUpgradeDetector:
    """A delivering traffic ad on a platform that now records enough purchases to optimise for them."""

    kind = "bidding_upgrade"

    def detect(self, snapshot: GrowthSnapshot, defaults: GrowthDefaults) -> list[Opportunity]:
        stats = {s.platform: s for s in snapshot.conversion_stats}
        found = []
        for ad in snapshot.ads:
            if ad.status != "active" or ad.objective != "traffic":
                continue
            if not bidding_switch(ad.platform, stats.get(ad.platform), defaults.bidding):
                continue
            platform_stats = stats[ad.platform]
            found.append(
                Opportunity(
                    kind=self.kind,
                    fingerprint=make_fingerprint(self.kind, [ad.ref]),
                    severity=Severity.MEDIUM,
                    title=f"Chuyển quảng cáo {ad.ref} sang tối ưu đơn hàng",
                    summary=(
                        f"{ad.platform}: {platform_stats.purchases_7d} đơn trong 7 ngày, "
                        f"{platform_stats.purchases_30d} đơn trong 30 ngày, đủ để tối ưu theo đơn hàng."
                    ),
                    evidence={
                        "ad_ref": ad.ref,
                        "platform": ad.platform,
                        "purchases_7d": platform_stats.purchases_7d,
                        "purchases_30d": platform_stats.purchases_30d,
                    },
                    detected_at=snapshot.taken_at,
                )
            )
        return found
