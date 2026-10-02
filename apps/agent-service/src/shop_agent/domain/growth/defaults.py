"""The growth agent's thresholds and lever priors (`data/growth/defaults.yaml`, `data/growth/priors.yaml`).

Both are assumptions the agent starts from (docs/GROWTH_AGENT.md section 1): the owner's settings override the money
limits, and measured outcomes move the priors (`learning.update_priors`). The files are read once, at import, by the
callers outside the domain; the defaults here are the same values, for tests and for a missing file.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class _Defaults(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class DetectorDefaults(_Defaults):
    revenue_gap_pct: float = 10
    revenue_gap_min_days: int = 4  # the first days of a month say little about its pace
    overstock_cover_days: float = 120
    overstock_min_units: int = 20
    velocity_days: int = 28
    rising_ratio: float = 1.5
    rising_min_cover_days: float = 21
    rising_min_units_7d: int = 5
    undercut_pct: float = 8
    undercut_fresh_hours: int = 72
    undercut_sales_days: int = 30
    trend_spike_pct: float = 40
    trend_fresh_days: int = 7
    seasonal_lead_days: int = 14
    content_cadence_days: int = 4
    new_arrival_days: int = 14
    scaling_roas: float = 3.0
    scaling_lookback_days: int = 7


class BiddingDefaults(_Defaults):
    meta_purchases_7d: int = 50
    tiktok_purchases_7d: int = 50
    google_conversions_30d: int = 30


class GuardDefaults(_Defaults):
    overspend_ratio: float = 1.2
    roas_floor: float = 1.5
    roas_min_spend_vnd: int = 500_000
    promo_min_days: int = 3


class PrioritizeDefaults(_Defaults):
    max_open_growth_threads: int = 3
    max_new_per_tick: int = 2
    cooldown_days: int = 7
    min_ad_budget_vnd: int = 300_000
    blackout_dates: tuple[date, ...] = ()


class MeasurementDefaults(_Defaults):
    pre_days: int = 14
    min_controls: int = 3
    price_band: float = 0.3
    min_confidence: float = 0.5
    post_check_hours: int = 72
    after_days: int = 7


class AllocationDefaults(_Defaults):
    exploration_floor: float = 0.2


class GrowthDefaults(_Defaults):
    detectors: DetectorDefaults = DetectorDefaults()
    bidding: BiddingDefaults = BiddingDefaults()
    guard: GuardDefaults = GuardDefaults()
    prioritize: PrioritizeDefaults = PrioritizeDefaults()
    measurement: MeasurementDefaults = MeasurementDefaults()
    allocation: AllocationDefaults = AllocationDefaults()


class Prior(_Defaults):
    """A lever assumption: its mean, its 10th-90th percentile range, and how many outcomes it is worth (`n0`)."""

    mean: float
    low: float
    high: float
    n0: float = Field(default=5, gt=0)

    @model_validator(mode="after")
    def _ordered(self) -> Prior:
        if not self.low <= self.mean <= self.high:
            raise ValueError("a prior needs low <= mean <= high")
        return self


class Priors(_Defaults):
    """Lever priors by name: `promotion.uplift_per_pct`, `post.views`, `ads.meta`, ..."""

    values: dict[str, Prior]

    @classmethod
    def from_mapping(cls, data: Mapping[str, Mapping[str, Any]]) -> Priors:
        """From the YAML's two levels (`{group: {name: prior}}`) to `group.name` keys."""
        return cls(
            values={
                f"{group}.{name}": Prior.model_validate(v) for group, items in data.items() for name, v in items.items()
            }
        )

    def get(self, name: str) -> Prior:
        try:
            return self.values[name]
        except KeyError as exc:
            raise KeyError(f"no prior {name!r}") from exc

    def with_values(self, updates: Mapping[str, Prior]) -> Priors:
        return Priors(values={**self.values, **updates})


DEFAULT_PRIORS = Priors.from_mapping(
    {
        "promotion": {"uplift_per_pct": {"mean": 0.04, "low": 0.02, "high": 0.07}},
        "coupon": {
            "redemption": {"mean": 0.15, "low": 0.08, "high": 0.25},
            "incremental": {"mean": 0.3, "low": 0.1, "high": 0.5},
        },
        "post": {
            "views": {"mean": 600, "low": 250, "high": 1500},
            "click_rate": {"mean": 0.012, "low": 0.005, "high": 0.025},
            "order_rate": {"mean": 0.02, "low": 0.01, "high": 0.035},
        },
        "ads": {
            "meta": {"mean": 2.5, "low": 1.2, "high": 4.0},
            "google": {"mean": 3.0, "low": 1.5, "high": 5.0},
            "tiktok": {"mean": 2.0, "low": 0.8, "high": 3.5},
            "conversion_bidding_uplift": {"mean": 0.15, "low": 0.0, "high": 0.3},
        },
    }
)
