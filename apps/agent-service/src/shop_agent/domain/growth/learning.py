"""Moving a lever's prior towards what was measured (docs/GROWTH_AGENT.md section 6).

posterior = (n0 * prior + n * observed) / (n0 + n). The range keeps its relative width around the new mean, and the
prior's weight grows by the outcomes it absorbed, so each new outcome moves it less. `observe` reads what a measured
option says about its levers: an ad platform's ROAS, a post's views and click rate, a discount's uplift per percent.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date

from shop_agent.domain.actions import ActionSpec
from shop_agent.domain.growth.defaults import Prior, Priors
from shop_agent.domain.growth.demand import revenue_between
from shop_agent.domain.growth.measurement import GrowthMeasurement
from shop_agent.domain.growth.snapshot import GrowthSnapshot


def update_priors(prior: Prior, observed: float, n: int = 1) -> Prior:
    if n <= 0:
        return prior
    mean = (prior.n0 * prior.mean + n * observed) / (prior.n0 + n)
    if prior.mean > 0:
        scale = mean / prior.mean
        low, high = prior.low * scale, prior.high * scale
    else:
        low, high = min(prior.low, mean), max(prior.high, mean)
    return Prior(mean=mean, low=min(low, mean), high=max(high, mean), n0=prior.n0 + n)


MIN_OBSERVED_SPEND_VND = 200_000  # an ad's ROAS says little below this spend


def observe(
    snapshot: GrowthSnapshot, actions: Sequence[ActionSpec], measurement: GrowthMeasurement, first: date, last: date
) -> dict[str, float]:
    """What one measured option says about the priors it was estimated with (lever prior name -> observed value)."""
    observed: dict[str, float] = {}
    platform_of = {str(a.body["ref"]): str(a.body["platform"]) for a in actions if a.type == "create_ad"}
    for platform in sorted(set(platform_of.values())):
        rows = [m for m in snapshot.ad_metrics if platform_of.get(m.ad_ref) == platform and first <= m.day <= last]
        spend = sum(r.spend_vnd for r in rows)
        if spend >= MIN_OBSERVED_SPEND_VND:
            observed[f"ads.{platform}"] = sum(r.conversion_value_vnd for r in rows) / spend
    posts = {str(a.body["ref"]) for a in actions if a.type == "create_post"}
    post_rows = [m for m in snapshot.post_metrics if m.post_ref in posts]
    impressions = sum(r.impressions for r in post_rows)
    if posts and impressions > 0:
        observed["post.views"] = impressions / len(posts)
        observed["post.click_rate"] = sum(r.clicks for r in post_rows) / impressions
    discount = next((a for a in actions if a.type == "apply_discount" and a.body.get("skus")), None)
    if discount is not None and measurement.method == "did":
        revenue = revenue_between(snapshot, discount.body["skus"], first, last)
        base = revenue - measurement.incremental_revenue_vnd
        if base > 0:
            observed["promotion.uplift_per_pct"] = max(
                0.0, measurement.incremental_revenue_vnd / base / float(discount.body["percent"])
            )
    return observed


def learn_priors(priors: Priors, observed: Mapping[str, float]) -> dict[str, Prior]:
    """The updated priors (only those with an observation)."""
    return {name: update_priors(priors.get(name), value) for name, value in observed.items() if name in priors.values}
