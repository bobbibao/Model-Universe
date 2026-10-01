"""The bidding rule (docs/GROWTH_AGENT.md section 6): purchases before optimising for purchases."""

from __future__ import annotations

from shop_agent.domain.growth.defaults import BiddingDefaults
from shop_agent.domain.growth.detectors import bidding_switch
from shop_agent.domain.growth.snapshot import ConversionStats

D = BiddingDefaults()


def test_meta_and_tiktok_switch_at_50_purchases_in_7_days() -> None:
    for platform in ("meta", "tiktok"):
        assert not bidding_switch(platform, ConversionStats(platform, 49, 400), D)
        assert bidding_switch(platform, ConversionStats(platform, 50, 50), D)


def test_google_switches_at_30_conversions_in_30_days() -> None:
    assert not bidding_switch("google", ConversionStats("google", 29, 29), D)
    assert bidding_switch("google", ConversionStats("google", 0, 30), D)


def test_no_stats_no_switch() -> None:
    assert not bidding_switch("meta", None, D)
