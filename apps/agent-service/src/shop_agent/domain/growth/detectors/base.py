"""Growth detectors: pure functions from a growth snapshot to opportunities (docs/GROWTH_AGENT.md section 1).

Each detector returns at most a few opportunities with a stable fingerprint (kind, scope, period bucket), so the
monitor opens one thread per situation; thresholds are `GrowthDefaults.detectors`.
"""

from __future__ import annotations

from datetime import date
from typing import Protocol

from shop_agent.domain.growth.defaults import GrowthDefaults
from shop_agent.domain.growth.snapshot import GrowthSnapshot
from shop_agent.domain.models import Opportunity

MAX_SKUS = 20  # an opportunity's scope stays inside the web's low-tier SKU count


class GrowthDetector(Protocol):
    kind: str

    def detect(self, snapshot: GrowthSnapshot, defaults: GrowthDefaults) -> list[Opportunity]: ...


def week_bucket(day: date) -> str:
    year, week, _ = day.isocalendar()
    return f"{year}-W{week:02d}"


def month_bucket(day: date) -> str:
    return f"{day:%Y-%m}"
