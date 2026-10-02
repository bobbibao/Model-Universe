"""The scheduled tick (docs/ARCHITECTURE.md section 6.2, docs/GROWTH_AGENT.md section 1). No model is called.

- `sync_metrics`: the web pulls the platforms' ad and post numbers (at most every 55 minutes, key `sync:{yyyymmddHH}`).
- `guard`: in-flight checks on live ads and promotions; each finding is a protective action (pause, end; the web
  notifies the admins) and an `incident_review` thread that only learns.
- `sweep`: due follow-ups wake their thread (measure); reviews past their expiry are resumed with `expire`; threads
  whose last run failed (e.g. the day's LLM budget was spent) are retried.
- `detect`: the deterministic detectors over one snapshot (operations, and growth unless the kill switch is off); the
  Monday cron adds the `weekly_plan`.
- `prioritize`: new growth fingerprints ranked by expected profit x confidence under capacity, cooldown, blackout
  and ad budget; the rest are recorded as deferred.
- `open_threads`: one `improvement` thread per new fingerprint, id `uuid5(fingerprint)`; the Store's `("signals",)`
  record makes a known fingerprint a no-op until its thread is closed and the cooldown has passed.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime
from langgraph.store.base import BaseStore

from shop_agent import wiring
from shop_agent.adapters.growth_files import GROWTH_DEFAULTS
from shop_agent.agents.kinds import KINDS
from shop_agent.config import get_settings
from shop_agent.domain.actions import to_spec
from shop_agent.domain.detectors import default_detectors
from shop_agent.domain.growth.detectors import detect_growth
from shop_agent.domain.growth.guard import guard
from shop_agent.domain.growth.marketing import METRICS_SYNC_ENDPOINT, MetricsSync
from shop_agent.domain.growth.prioritize import Ranked, prioritize
from shop_agent.domain.growth.snapshot import VN, GrowthSnapshot
from shop_agent.domain.growth.strategies import GrowthFacts, opportunity_value
from shop_agent.domain.models import Opportunity, Severity, make_fingerprint
from shop_agent.graphs.improvement import FOLLOWUPS, GROWTH, SIGNALS, current_priors
from shop_agent.graphs.launchers import SdkLauncher, ThreadLauncher
from shop_agent.logging import get_logger
from shop_agent.tools.deps import ShopDeps, configure, get_deps

logger = get_logger(__name__)

configure(wiring.default_deps)

THREAD_NAMESPACE = uuid.UUID("0b8f7d5e-3c1a-5f2e-9d47-1a6b2c3d4e5f")
SWEEP_LIMIT = 1000
SYNC_EVERY = timedelta(minutes=55)
SYNC_KEY = "metrics_sync"


@dataclass
class MonitorContext:
    deps: ShopDeps
    launcher: ThreadLauncher


class State(TypedDict, total=False):
    weekly_plan: bool  # set by the Monday cron
    synced: bool
    guarded: list[str]
    incidents: list[str]
    woken: list[str]
    expired: list[str]
    retried: list[str]
    opportunities: list[dict[str, Any]]
    deferred: list[dict[str, str]]
    opened: list[str]
    skipped: list[str]


def thread_id_for(fingerprint: str, generation: int = 1) -> str:
    """Deterministic: detecting the same situation twice can never open two threads."""
    name = fingerprint if generation == 1 else f"{fingerprint}#{generation}"
    return str(uuid.uuid5(THREAD_NAMESPACE, name))


async def _context(runtime: Runtime[Any]) -> MonitorContext:
    if isinstance(runtime.context, MonitorContext):
        return runtime.context
    return MonitorContext(await get_deps(runtime), SdkLauncher())


def _store(runtime: Runtime[Any]) -> BaseStore:
    if runtime.store is None:
        raise RuntimeError("the monitor graph needs a Store (the Agent Server provides one)")
    return runtime.store


async def sync_metrics(state: State, runtime: Runtime[Any]) -> State:
    ctx = await _context(runtime)
    store = _store(runtime)
    now = ctx.deps.clock()
    last = await store.aget(GROWTH, SYNC_KEY)
    if last is not None and datetime.fromisoformat(last.value["at"]) + SYNC_EVERY > now:
        return {"synced": False}
    result = await ctx.deps.writer.ingest(
        METRICS_SYNC_ENDPOINT, MetricsSync().body(), idempotency_key=MetricsSync.idempotency_key(now)
    )
    if not result.ok:
        logger.warning("metrics sync failed", detail=result.detail)
        return {"synced": False}
    await store.aput(GROWTH, SYNC_KEY, {"at": now.isoformat(), "detail": result.detail}, index=False)
    return {"synced": True}


async def guard_node(state: State, runtime: Runtime[Any]) -> State:
    """Protective actions on live ads and promotions; each one opens an incident review (learn only)."""
    ctx = await _context(runtime)
    now = ctx.deps.clock()
    snapshot = await ctx.deps.reader.growth_snapshot(now)
    acted, incidents = [], []
    for finding in guard(snapshot, GROWTH_DEFAULTS):
        key = f"guard:{finding.ref}:{now.astimezone(VN):%Y%m%d%H}"
        action = to_spec(finding.action, action_id=f"guard-{finding.rule}", idempotency_key=key)
        result = await ctx.deps.writer.execute(action, context={"approval_mode": "protective", "rule": finding.rule})
        if not result.ok:
            logger.warning("guard action failed", ref=finding.ref, rule=finding.rule, detail=result.detail)
            continue
        acted.append(finding.ref)
        incident = Opportunity(
            kind="incident_review",
            fingerprint=make_fingerprint("incident_review", [finding.ref], f"{finding.rule}:{snapshot.today}"),
            severity=Severity.HIGH,
            title=finding.action.description,
            summary=finding.reason,
            evidence={"rule": finding.rule, "ref": finding.ref, "capability": finding.capability.value},
            detected_at=now,
        )
        thread_id = thread_id_for(incident.fingerprint)
        metadata = {"graph": "improvement", "kind": incident.kind, "title": incident.title, "severity": "high"}
        data = incident.model_dump(mode="json")
        await ctx.launcher.open(thread_id, input={"opportunity": data, "stage": "learning", "outcome": "incident"},
                                metadata={**metadata, "fingerprint": incident.fingerprint})  # fmt: skip
        incidents.append(thread_id)
        logger.info("guard acted", ref=finding.ref, rule=finding.rule, thread_id=thread_id)
    return {"guarded": acted, "incidents": incidents}


async def sweep(state: State, runtime: Runtime[Any]) -> State:
    ctx = await _context(runtime)
    now = ctx.deps.clock()
    woken = []
    for item in await _store(runtime).asearch(FOLLOWUPS, limit=SWEEP_LIMIT):
        if datetime.fromisoformat(item.value["due_at"]) <= now and await ctx.launcher.wake(item.key, "followup_due"):
            woken.append(item.key)
    expired = []
    for thread_id in await ctx.launcher.stale_reviews(now):
        if await ctx.launcher.resume(thread_id, {"type": "expire", "approver": "system:sweep"}):
            expired.append(thread_id)
    retried = [t for t in await ctx.launcher.failed() if await ctx.launcher.retry(t)]
    return {"woken": woken, "expired": expired, "retried": retried}


def weekly_plan(snapshot: GrowthSnapshot) -> Opportunity:
    week = snapshot.today.isocalendar()
    return Opportunity(
        kind="weekly_plan",
        fingerprint=make_fingerprint("weekly_plan", [], f"{week.year}-W{week.week:02d}"),
        severity=Severity.MEDIUM,
        title=f"Kế hoạch tuần {week.week}",
        summary="Lên kế hoạch bài đăng và phân bổ ngân sách quảng cáo cho tuần này.",
        detected_at=snapshot.taken_at,
    )


async def detect(state: State, runtime: Runtime[Any]) -> State:
    ctx = await _context(runtime)
    now = ctx.deps.clock()
    snapshot = await ctx.deps.reader.snapshot(now)
    growth = await ctx.deps.reader.growth_snapshot(now)
    found = [o for d in default_detectors() for o in d.detect(snapshot, now)]
    found += detect_growth(growth, GROWTH_DEFAULTS)
    if state.get("weekly_plan") and growth.settings.growth_enabled:
        found.append(weekly_plan(growth))
    return {"opportunities": [o.model_dump(mode="json") for o in found if o.kind in KINDS]}


async def _known(store: BaseStore, opportunity: Opportunity, now: datetime) -> tuple[bool, int]:
    """Whether the fingerprint is open or cooling down, and the generation a new thread would have."""
    record = await store.aget(SIGNALS, opportunity.fingerprint)
    if record is None:
        return False, 1
    closed_at = record.value.get("closed_at")
    cooldown = timedelta(hours=get_settings().signal_cooldown_hours)
    if closed_at is None or datetime.fromisoformat(closed_at) + cooldown > now:
        return True, 0
    return False, int(record.value.get("generation", 1)) + 1


async def prioritize_node(state: State, runtime: Runtime[Any]) -> State:
    """Operations opportunities pass through; new growth ones are ranked and limited, the rest deferred."""
    ctx = await _context(runtime)
    store = _store(runtime)
    now = ctx.deps.clock()
    keep, candidates = [], []
    growth: GrowthSnapshot | None = None
    for data in state.get("opportunities", []):
        opportunity = Opportunity.model_validate(data)
        if not KINDS[opportunity.kind].growth:
            keep.append(data)
            continue
        if (await _known(store, opportunity, now))[0]:
            keep.append(data)  # open_threads records it as skipped
            continue
        if growth is None:
            growth = await ctx.deps.reader.growth_snapshot(now)
            facts = GrowthFacts(growth, "prioritize", GROWTH_DEFAULTS, await current_priors(store))
        candidates.append(Ranked(opportunity, opportunity_value(opportunity, facts)))
    if growth is None:
        return {"opportunities": keep, "deferred": []}
    signals = await store.asearch(SIGNALS, limit=SWEEP_LIMIT)
    growth_signals = [i.value for i in signals if i.value.get("kind") in KINDS and KINDS[i.value["kind"]].growth]
    last_opened: dict[str, datetime] = {}
    for value in growth_signals:
        opened_at = datetime.fromisoformat(value["opened_at"])
        last_opened[value["kind"]] = max(last_opened.get(value["kind"], opened_at), opened_at)
    budget = growth.budget[-1].remaining_vnd if growth.budget else 0
    result = prioritize(
        candidates,
        today=growth.today,
        now=now,
        open_threads=sum(1 for v in growth_signals if v.get("closed_at") is None),
        last_opened=last_opened,
        ad_budget_left_vnd=budget,
        defaults=GROWTH_DEFAULTS.prioritize,
    )
    deferred = [{"fingerprint": r.opportunity.fingerprint, "reason": reason} for r, reason in result.deferred]
    opened = [r.opportunity.model_dump(mode="json") for r in result.opened]
    return {"opportunities": keep + opened, "deferred": deferred}


async def open_threads(state: State, runtime: Runtime[Any]) -> State:
    ctx = await _context(runtime)
    store = _store(runtime)
    now = ctx.deps.clock()
    opened, skipped = [], []
    for data in state.get("opportunities", []):
        opportunity = Opportunity.model_validate(data)
        known, generation = await _known(store, opportunity, now)
        if known:
            skipped.append(opportunity.fingerprint)
            continue
        thread_id = thread_id_for(opportunity.fingerprint, generation)
        metadata = {
            "graph": "improvement",
            "kind": opportunity.kind,
            "title": opportunity.title,
            "severity": opportunity.severity.value,
            "fingerprint": opportunity.fingerprint,
        }
        await ctx.launcher.open(thread_id, input={"opportunity": data}, metadata=metadata)
        signal = {
            "thread_id": thread_id,
            "generation": generation,
            "kind": opportunity.kind,
            "opened_at": now.isoformat(),
        }
        await store.aput(SIGNALS, opportunity.fingerprint, signal, index=False)
        opened.append(thread_id)
        logger.info(
            "improvement opened", thread_id=thread_id, kind=opportunity.kind, fingerprint=opportunity.fingerprint
        )
    return {"opened": opened, "skipped": skipped}


def build() -> StateGraph[State, Any, State, State]:
    builder: StateGraph[State, Any, State, State] = StateGraph(State)
    builder.add_node("sync_metrics", sync_metrics)
    builder.add_node("guard", guard_node)
    builder.add_node("sweep", sweep)
    builder.add_node("detect", detect)
    builder.add_node("prioritize", prioritize_node)
    builder.add_node("open_threads", open_threads)
    builder.add_edge(START, "sync_metrics")
    builder.add_edge("sync_metrics", "guard")
    builder.add_edge("guard", "sweep")
    builder.add_edge("sweep", "detect")
    builder.add_edge("detect", "prioritize")
    builder.add_edge("prioritize", "open_threads")
    builder.add_edge("open_threads", END)
    return builder


graph = build().compile(name="monitor")
