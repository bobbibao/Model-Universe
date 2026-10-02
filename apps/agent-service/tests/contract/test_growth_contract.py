"""Growth data shared with the web: the settings defaults, the market calendar, and the collector's request body."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime
from pathlib import Path

import yaml

from shop_agent.adapters.fake_world import CALENDAR
from shop_agent.adapters.shop_api import AgentApiWriter
from shop_agent.domain.growth.market import (
    MARKET_OBSERVATIONS_ENDPOINT,
    CampaignObservation,
    MarketObservations,
    PriceObservation,
    TrendObservation,
)
from shop_agent.domain.growth.settings import GrowthSettings
from tests.support.web_double import BASE_PATH, HOST, TOKEN, WebDouble

REPO = Path(__file__).resolve().parents[4]
SETTINGS_VECTOR = REPO / "packages/contracts/test-vectors/agent-settings.json"
WEB_CALENDAR = REPO / "apps/web-ecommerce/src/core/server/database/client/seeders/data/events_vn.json"


def test_settings_defaults_match_the_vector() -> None:
    defaults = json.loads(SETTINGS_VECTOR.read_text("utf-8"))["defaults"]
    assert GrowthSettings.from_values({}).as_values() == defaults
    assert GrowthSettings.from_values(defaults) == GrowthSettings()


def test_the_web_seeds_the_same_calendar() -> None:
    ours = yaml.safe_load(CALENDAR.read_text("utf-8"))["events"]
    web = json.loads(WEB_CALENDAR.read_text("utf-8"))
    normalised = [
        {**event, "starts_on": event["starts_on"].isoformat(), "ends_on": event["ends_on"].isoformat()}
        for event in ours
    ]
    assert normalised == web
    assert all(isinstance(e["starts_on"], date) and e["starts_on"] <= e["ends_on"] for e in ours)
    assert len({(e["code"], e["starts_on"]) for e in ours}) == len(ours)


async def test_observations_are_accepted_by_the_contract() -> None:
    double = WebDouble()
    writer = AgentApiWriter(f"{HOST}{BASE_PATH}", TOKEN, client=double.client())
    observed = datetime(2026, 9, 29, 23, 45, tzinfo=UTC)
    body = MarketObservations(
        source="competitor_sites",
        status="degraded",
        detail="1 giá từ 2 trang",
        observed_at=observed,
        trends=(TrendObservation(keyword="áo khoác", date=date(2026, 9, 29), interest=55),),
        competitor_prices=(
            PriceObservation(
                competitor="Thời Trang An Nhiên",
                sku="SKU-1",
                url="https://an-nhien.example/p/1",
                title="Áo",
                price_vnd=349_000,
                confidence=0.8,
            ),
        ),
        competitor_campaigns=(
            CampaignObservation(competitor="Thời Trang An Nhiên", title="Giảm 20%", discount_pct=20),
        ),
    )
    result = await writer.ingest(MARKET_OBSERVATIONS_ENDPOINT, body.body(), idempotency_key=body.idempotency_key())
    assert result.ok, result.detail
    [applied] = double.applied
    assert applied.endpoint == MARKET_OBSERVATIONS_ENDPOINT and applied.body == body.body()
    assert applied.idempotency_key == "collect:competitor_sites:2026-09-30"


async def test_the_contract_refuses_an_unknown_source() -> None:
    double = WebDouble()
    writer = AgentApiWriter(f"{HOST}{BASE_PATH}", TOKEN, client=double.client())
    body = {"source": "marketplace", "observed_at": "2026-09-29T23:45:00Z"}
    result = await writer.ingest(MARKET_OBSERVATIONS_ENDPOINT, body, idempotency_key="collect:marketplace:2026-09-30")
    assert not result.ok and double.applied == []
