"""Ingestion requests the agent sends about marketing (no grant, nothing to revert; `ShopWriter.ingest`).

Bodies mirror packages/contracts/openapi/web-agent-api.yaml. The keys follow docs/GROWTH_AGENT.md section 4
("Idempotency key schemes"): a metrics sync once an hour, an outcome once per measurement, a notification once per
dedupe key and day.
"""

from __future__ import annotations

import datetime as dt
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from shop_agent.domain.capabilities import Capability
from shop_agent.domain.growth.snapshot import VN, vn_date

METRICS_SYNC_ENDPOINT = "marketing/metrics/sync"
OUTCOMES_ENDPOINT = "marketing/outcomes"
NOTIFICATIONS_ENDPOINT = "notifications/admins"


class _Body(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    def body(self) -> dict[str, Any]:
        """The request body (JSON types, absent fields left out)."""
        return self.model_dump(mode="json", exclude_none=True)


class MetricsSync(_Body):
    lookback_days: int | None = Field(default=None, ge=1, le=7)

    @staticmethod
    def idempotency_key(now: dt.datetime) -> str:
        """`sync:{yyyymmddHH}` in Vietnam: at most one sync an hour."""
        return f"sync:{now.astimezone(VN):%Y%m%d%H}"


class Outcome(_Body):
    thread_id: str = Field(max_length=64)
    campaign_ref: str | None = Field(default=None, max_length=64)
    capability: Capability
    verdict: Literal["positive", "negative", "inconclusive"]
    incremental_revenue_vnd: int | None = None
    incremental_profit_vnd: int | None = None
    spend_vnd: int | None = Field(default=None, ge=0)
    confidence: float | None = Field(default=None, ge=0, le=1)
    measured_at: dt.datetime
    details: dict[str, Any] | None = None

    def idempotency_key(self) -> str:
        return f"outcome:{self.thread_id}:{self.measured_at.astimezone(dt.UTC):%Y%m%dT%H%M}"


class AdminNotification(_Body):
    subject: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=5000)
    severity: Literal["info", "warning", "critical"] | None = None
    dedupe_key: str | None = Field(default=None, max_length=128)

    def idempotency_key(self, now: dt.datetime) -> str:
        """Once per dedupe key and Vietnam day (the web sends a dedupe key once a day as well)."""
        return f"notify:{self.dedupe_key or self.subject}:{vn_date(now).isoformat()}"
