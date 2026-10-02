"""The in-flight guard (docs/GROWTH_AGENT.md section 1): protective actions on live ads and promotions. No model.

An ad is paused when today's spend is above `overspend_ratio` x its daily budget, when the month's spend has reached
the cap, or when its ROAS is under `roas_floor` after `roas_min_spend_vnd` of spend. A campaign's agent promotions end
when, after `promo_min_days`, they are measured to lose gross profit. Each finding is a protective action (always
allowed by the web) that the monitor sends, notifies, and reviews in an `incident_review` thread.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta

from shop_agent.domain.actions import AD_CAPABILITY, ActionDraft
from shop_agent.domain.capabilities import Capability
from shop_agent.domain.growth.defaults import GrowthDefaults
from shop_agent.domain.growth.measurement import measure_growth
from shop_agent.domain.growth.snapshot import GrowthSnapshot, vn_date


@dataclass(frozen=True)
class GuardFinding:
    ref: str  # the ad or campaign it acts on
    capability: Capability
    rule: str  # overspend | monthly_cap | roas_floor | negative_promotion
    reason: str  # Vietnamese, for the admins and the audit
    action: ActionDraft


def _pause(ad_ref: str, platform: str, rule: str, reason: str) -> GuardFinding:
    capability = AD_CAPABILITY[platform]
    action = ActionDraft(
        type="pause_ad",
        body={"reason": reason},
        path_params={"ref": ad_ref},
        capability_hint=capability,
        description=f"Tạm dừng quảng cáo {ad_ref}",
    )
    return GuardFinding(ad_ref, capability, rule, reason, action)


def guard(snapshot: GrowthSnapshot, defaults: GrowthDefaults) -> list[GuardFinding]:
    g = defaults.guard
    today = snapshot.today
    findings: list[GuardFinding] = []
    budget = snapshot.budget[-1] if snapshot.budget else None
    over_cap = budget is not None and budget.cap_vnd > 0 and budget.spent_vnd >= budget.cap_vnd
    metrics = defaultdict(list)
    for row in snapshot.ad_metrics:
        metrics[row.ad_ref].append(row)

    for ad in snapshot.ads:
        if ad.status != "active":
            continue
        rows = metrics.get(ad.ref, [])
        spend = sum(r.spend_vnd for r in rows)
        value = sum(r.conversion_value_vnd for r in rows)
        today_spend = sum(r.spend_vnd for r in rows if r.day == today)
        if over_cap:
            findings.append(_pause(ad.ref, ad.platform, "monthly_cap", "Chi tiêu quảng cáo đã chạm hạn mức của tháng."))
        elif today_spend > g.overspend_ratio * ad.daily_budget_vnd:
            reason = (
                f"Hôm nay đã chi {today_spend} VND, vượt {g.overspend_ratio:.0%} "
                f"ngân sách ngày {ad.daily_budget_vnd} VND."
            )
            findings.append(_pause(ad.ref, ad.platform, "overspend", reason))
        elif spend >= g.roas_min_spend_vnd and value / spend < g.roas_floor:
            reason = f"ROAS {value / spend:.2f} thấp hơn mức sàn {g.roas_floor:g} sau {spend} VND chi tiêu."
            findings.append(_pause(ad.ref, ad.platform, "roas_floor", reason))

    campaigns = {c.ref for c in snapshot.campaigns if c.status in ("active", "paused")}
    running: dict[str, list[str]] = defaultdict(list)
    started: dict[str, datetime] = {}
    for promo in snapshot.active_promotions():
        ref = promo.campaign_ref
        if promo.source != "agent" or promo.kind != "discount" or ref is None or ref not in campaigns or not promo.sku:
            continue
        running[ref].append(promo.sku)
        started[ref] = min(started.get(ref, promo.starts_at), promo.starts_at)
    for ref, skus in sorted(running.items()):
        first = vn_date(started[ref])
        last = today - timedelta(days=1)
        if (last - first).days + 1 < g.promo_min_days:
            continue
        result = measure_growth(snapshot, skus=skus, first=first, last=last, defaults=defaults.measurement)
        if result.verdict != "negative":
            continue
        reason = f"Khuyến mãi đang làm giảm lợi nhuận gộp ({result.incremental_profit_vnd} VND sau {result.days} ngày)."
        action = ActionDraft(
            type="end_promotion",
            body={"reason": reason},
            path_params={"ref": ref},
            description=f"Kết thúc khuyến mãi của chiến dịch {ref}",
        )
        findings.append(GuardFinding(ref, Capability.PROMOTION, "negative_promotion", reason, action))
    return findings
