"""The scheduled tick (docs/ARCHITECTURE.md section 6.2): sweep, detect, open threads. No model is called.

- `sweep`: due follow-ups wake their thread (measure); reviews past their expiry are resumed with `expire`; threads
  whose last run failed (e.g. the day's LLM budget was spent) are retried.
- `detect`: the deterministic detectors over one snapshot.
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
from shop_agent.agents.kinds import KINDS
from shop_agent.config import get_settings
from shop_agent.domain.detectors import default_detectors
from shop_agent.domain.models import Opportunity
from shop_agent.graphs.improvement import FOLLOWUPS, SIGNALS
from shop_agent.graphs.launchers import SdkLauncher, ThreadLauncher
from shop_agent.logging import get_logger
from shop_agent.tools.deps import ShopDeps, configure, get_deps

logger = get_logger(__name__)

configure(wiring.default_deps)

THREAD_NAMESPACE = uuid.UUID("0b8f7d5e-3c1a-5f2e-9d47-1a6b2c3d4e5f")
SWEEP_LIMIT = 1000


@dataclass
class MonitorContext:
    deps: ShopDeps
    launcher: ThreadLauncher


class State(TypedDict, total=False):
    woken: list[str]
    expired: list[str]
    retried: list[str]
    opportunities: list[dict[str, Any]]
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


async def detect(state: State, runtime: Runtime[Any]) -> State:
    ctx = await _context(runtime)
    now = ctx.deps.clock()
    snapshot = await ctx.deps.reader.snapshot(now)
    found = [o for d in default_detectors() for o in d.detect(snapshot, now) if o.kind in KINDS]
    return {"opportunities": [o.model_dump(mode="json") for o in found]}


async def open_threads(state: State, runtime: Runtime[Any]) -> State:
    ctx = await _context(runtime)
    store = _store(runtime)
    now = ctx.deps.clock()
    cooldown = timedelta(hours=get_settings().signal_cooldown_hours)
    opened, skipped = [], []
    for data in state.get("opportunities", []):
        opportunity = Opportunity.model_validate(data)
        record = await store.aget(SIGNALS, opportunity.fingerprint)
        generation = 1
        if record is not None:
            closed_at = record.value.get("closed_at")
            if closed_at is None or datetime.fromisoformat(closed_at) + cooldown > now:
                skipped.append(opportunity.fingerprint)
                continue
            generation = int(record.value.get("generation", 1)) + 1
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
    builder.add_node("sweep", sweep)
    builder.add_node("detect", detect)
    builder.add_node("open_threads", open_threads)
    builder.add_edge(START, "sweep")
    builder.add_edge("sweep", "detect")
    builder.add_edge("detect", "open_threads")
    builder.add_edge("open_threads", END)
    return builder


graph = build().compile(name="monitor")
