"""Which growth opportunities open a thread now (docs/GROWTH_AGENT.md section 1, `prioritize`).

Score = expected incremental gross profit x confidence (`GrowthEstimate.value`). Then the limits: no thread on a
blackout day, a kind waits `cooldown_days` after its last thread, at most `max_open_growth_threads` open at once and
`max_new_per_tick` per tick, and ad-only kinds need ad budget left this month. Everything not opened is deferred with
its reason.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from shop_agent.domain.growth.defaults import PrioritizeDefaults
from shop_agent.domain.models import Opportunity

AD_ONLY_KINDS = frozenset({"campaign_scaling", "bidding_upgrade"})


@dataclass(frozen=True)
class Ranked:
    opportunity: Opportunity
    score: float


@dataclass(frozen=True)
class Prioritized:
    opened: tuple[Ranked, ...]
    deferred: tuple[tuple[Ranked, str], ...]


def prioritize(
    candidates: Sequence[Ranked],
    *,
    today: date,
    now: datetime,
    open_threads: int,
    last_opened: Mapping[str, datetime],
    ad_budget_left_vnd: int,
    defaults: PrioritizeDefaults,
) -> Prioritized:
    """`last_opened`: when each kind last opened a thread; `open_threads`: growth threads not yet closed."""
    deferred: list[tuple[Ranked, str]] = []
    eligible: list[Ranked] = []
    for ranked in sorted(candidates, key=lambda r: (-r.score, r.opportunity.fingerprint)):
        kind = ranked.opportunity.kind
        if today in defaults.blackout_dates:
            deferred.append((ranked, "blackout day"))
        elif kind in last_opened and last_opened[kind] + timedelta(days=defaults.cooldown_days) > now:
            deferred.append((ranked, f"{kind} is cooling down"))
        elif kind in AD_ONLY_KINDS and ad_budget_left_vnd < defaults.min_ad_budget_vnd:
            deferred.append((ranked, "no ad budget left this month"))
        elif ranked.score <= 0:
            deferred.append((ranked, "no expected gain"))
        else:
            eligible.append(ranked)
    room = max(0, min(defaults.max_new_per_tick, defaults.max_open_growth_threads - open_threads))
    opened: list[Ranked] = []
    kinds: set[str] = set()
    for ranked in eligible:
        if len(opened) < room and ranked.opportunity.kind not in kinds:  # one thread per kind per tick
            opened.append(ranked)
            kinds.add(ranked.opportunity.kind)
        else:
            deferred.append((ranked, "capacity"))
    return Prioritized(tuple(opened), tuple(deferred))
