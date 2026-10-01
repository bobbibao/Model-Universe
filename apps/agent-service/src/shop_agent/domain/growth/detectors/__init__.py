"""The growth detectors (docs/GROWTH_AGENT.md section 1), run by the monitor over one growth snapshot."""

from __future__ import annotations

from shop_agent.domain.growth.defaults import GrowthDefaults
from shop_agent.domain.growth.detectors.ads import BiddingUpgradeDetector, CampaignScalingDetector, bidding_switch
from shop_agent.domain.growth.detectors.base import GrowthDetector
from shop_agent.domain.growth.detectors.content import ContentCadenceDetector, NewArrivalsDetector
from shop_agent.domain.growth.detectors.demand import OverstockDetector, RisingDemandDetector
from shop_agent.domain.growth.detectors.goal import RevenueGapDetector
from shop_agent.domain.growth.detectors.market import (
    CompetitorCampaignDetector,
    CompetitorUndercutDetector,
    SeasonalEventDetector,
    TrendSpikeDetector,
)
from shop_agent.domain.growth.snapshot import GrowthSnapshot
from shop_agent.domain.models import Opportunity

GROWTH_DETECTORS: tuple[GrowthDetector, ...] = (
    RevenueGapDetector(),
    OverstockDetector(),
    RisingDemandDetector(),
    CompetitorUndercutDetector(),
    CompetitorCampaignDetector(),
    TrendSpikeDetector(),
    SeasonalEventDetector(),
    ContentCadenceDetector(),
    NewArrivalsDetector(),
    CampaignScalingDetector(),
    BiddingUpgradeDetector(),
)


def detect_growth(snapshot: GrowthSnapshot, defaults: GrowthDefaults) -> list[Opportunity]:
    """Every growth opportunity in the snapshot; none while the owner's kill switch is off."""
    if not snapshot.settings.growth_enabled:
        return []
    return [o for detector in GROWTH_DETECTORS for o in detector.detect(snapshot, defaults)]


__all__ = ["GROWTH_DETECTORS", "GrowthDetector", "bidding_switch", "detect_growth"]
