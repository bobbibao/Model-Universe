"""The daily market collection (plan 5.9): read the outside sources, post what they saw to the web. No model is called.

- `read`: one GrowthSnapshot (the owner's keywords, the watched competitor pages, each source's last run), then each
  requested source's collector. A source the rollout flags turn off reports `off`; a source that already reported
  today is skipped (its idempotency key `collect:{source}:{date}` allows one post a day).
- `post`: `POST /market/observations` per source (ingestion class), unless the run is a dry run. The observations are
  checkpointed between the two steps, so a failed post is retried without reading the sites again.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime

from shop_agent import wiring
from shop_agent.adapters.market import MarketCollector
from shop_agent.config import get_settings
from shop_agent.domain.growth.market import MARKET_OBSERVATIONS_ENDPOINT, MarketObservations
from shop_agent.domain.growth.snapshot import vn_date
from shop_agent.logging import get_logger
from shop_agent.tools.deps import ShopDeps, configure, get_deps

logger = get_logger(__name__)

configure(wiring.default_deps)

DEFAULT_SOURCES = ("trends", "competitor_sites")  # the cron's sources; `fixture` runs only when asked for


@dataclass
class CollectContext:
    deps: ShopDeps
    collectors: Mapping[str, MarketCollector]
    enabled: frozenset[str]  # the sources the rollout flags allow


class State(TypedDict, total=False):
    sources: list[str]  # input: the sources to read (default DEFAULT_SOURCES)
    dry_run: bool  # input: read, but post nothing
    observations: list[dict[str, Any]]  # request bodies, one per source
    results: list[dict[str, Any]]


async def _context(runtime: Runtime[Any]) -> CollectContext:
    if isinstance(runtime.context, CollectContext):
        return runtime.context
    settings = get_settings()
    return CollectContext(
        await get_deps(runtime), wiring.market_collectors(settings), wiring.enabled_market_sources(settings.flags)
    )


def _counts(body: Mapping[str, Any]) -> dict[str, int]:
    return {name: len(body.get(name, ())) for name in ("trends", "competitor_prices", "competitor_campaigns")}


async def read(state: State, runtime: Runtime[Any]) -> State:
    ctx = await _context(runtime)
    now = ctx.deps.clock()
    snapshot = await ctx.deps.reader.growth_snapshot(now)
    reported_today = {
        source.name
        for source in snapshot.sources
        if source.last_run_at and vn_date(source.last_run_at) == snapshot.today
    }
    dry_run = bool(state.get("dry_run"))
    observations: list[dict[str, Any]] = []
    results: list[dict[str, Any]] = []
    for source in state.get("sources") or DEFAULT_SOURCES:
        collector = ctx.collectors.get(source)
        if collector is None:
            results.append({"source": source, "skipped": "unknown source"})
            continue
        if source in reported_today and not dry_run:
            results.append({"source": source, "skipped": "already reported today"})
            continue
        if source in ctx.enabled:
            found = await collector.collect(snapshot)
        else:
            found = MarketObservations(
                source=collector.source, status="off", observed_at=now, detail="đã tắt bằng cờ triển khai (FF_MARKET_*)"
            )
        logger.info("market source read", source=source, status=found.status, **_counts(found.body()))
        observations.append(found.body())
    return {"observations": observations, "results": results}


async def post(state: State, runtime: Runtime[Any]) -> State:
    ctx = await _context(runtime)
    results = list(state.get("results", []))
    for body in state.get("observations", []):
        observations = MarketObservations.model_validate(body)
        entry: dict[str, Any] = {
            "source": observations.source,
            "status": observations.status,
            "detail": observations.detail,
            **_counts(body),
        }
        if state.get("dry_run"):
            results.append({**entry, "posted": False})
            continue
        result = await ctx.deps.writer.ingest(
            MARKET_OBSERVATIONS_ENDPOINT, observations.body(), idempotency_key=observations.idempotency_key()
        )
        results.append({**entry, "posted": result.ok, "ref": result.ref, "response": result.detail})
        if not result.ok:
            logger.warning("market observations refused", source=observations.source, detail=result.detail)
    return {"results": results}


def build() -> StateGraph[State, Any, State, State]:
    builder: StateGraph[State, Any, State, State] = StateGraph(State)
    builder.add_node("read", read)
    builder.add_node("post", post)
    builder.add_edge(START, "read")
    builder.add_edge("read", "post")
    builder.add_edge("post", END)
    return builder


graph = build().compile(name="collect")
