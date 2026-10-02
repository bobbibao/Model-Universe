"""`shop-agent` command line: development server, simulations, checks and operations.

Subcommands are added phase by phase (docs/ROADMAP.md).
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from shop_agent.config import get_settings
from shop_agent.logging import configure_logging

SERVICE_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class CronSpec:
    """A scheduled run. Schedules are UTC cron strings (Asia/Ho_Chi_Minh is UTC+7, no daylight saving)."""

    name: str
    assistant_id: str
    schedule: str
    dev_schedule: str | None = None
    input: Mapping[str, Any] = field(default_factory=dict)
    keep_thread: bool = False  # the server deletes a cron run's thread unless told to keep it (a briefing is read)


CRONS: tuple[CronSpec, ...] = (
    CronSpec("monitor", "monitor", "*/15 * * * *", dev_schedule="* * * * *"),
    CronSpec("collect", "collect", "45 23 * * *"),  # 06:45 in Vietnam
    CronSpec("weekly_plan", "monitor", "45 1 * * 1", input={"weekly_plan": True}),  # Monday 08:45 in Vietnam
    CronSpec(  # 07:45 in Vietnam; the copilot follows its daily-briefing skill
        "daily_briefing",
        "assistant",
        "45 0 * * *",
        input={"messages": [{"role": "user", "content": "Hãy chuẩn bị bản tin hằng ngày."}]},
        keep_thread=True,
    ),
)
MANAGED_BY = "shop-agent"
DEV_SERVER_URL = "http://localhost:2024"


async def sync_crons(client: Any, app_env: str) -> list[str]:
    """Make the server's crons match CRONS (idempotent); returns what changed. Crons we did not create are left."""
    existing = await client.crons.search(metadata={"managed_by": MANAGED_BY}, limit=100)
    ours = {(c.get("metadata") or {}).get("cron"): c for c in existing}
    changes = []
    for spec in CRONS:
        schedule = spec.dev_schedule if app_env == "dev" and spec.dev_schedule else spec.schedule
        current = ours.pop(spec.name, None)
        if current is not None and current.get("schedule") == schedule:
            continue
        if current is not None:
            await client.crons.delete(current["cron_id"])
        # Created disabled, then enabled: Aegra runs a new cron at once unless it starts disabled (ADR-0013). Both
        # runtimes then fire it on its schedule only.
        created = await client.crons.create(
            spec.assistant_id,
            schedule=schedule,
            input=dict(spec.input),
            metadata={"managed_by": MANAGED_BY, "cron": spec.name},
            on_run_completed="keep" if spec.keep_thread else "delete",
            enabled=False,
        )
        await client.crons.update(created["cron_id"], enabled=True)
        changes.append(f"{spec.name}: {schedule}")
    for name, stale in ours.items():
        await client.crons.delete(stale["cron_id"])
        changes.append(f"{name}: removed")
    return changes


def _cmd_sync_crons(args: argparse.Namespace) -> int:
    """Create or update the Agent Server's crons (the dev server keeps them in memory: re-run after a restart)."""
    import asyncio

    from langgraph_sdk import get_client

    from shop_agent.graphs.launchers import system_headers

    client = get_client(url=args.url or get_settings().agent_server_url or DEV_SERVER_URL, headers=system_headers())
    changes = asyncio.run(sync_crons(client, get_settings().app_env))
    print("\n".join(changes) if changes else "crons up to date")
    return 0


def _cmd_mint_token(args: argparse.Namespace) -> int:
    """Print an actor token (e.g. for Claude Code's MCP entry: SHOP_AGENT_TOKEN), signed with AGENT_ACTOR_SECRET."""
    from shop_agent.adapters.actor_tokens import SYSTEM_SUBJECT, mint_actor_token

    settings = get_settings()
    subject = SYSTEM_SUBJECT if args.role == "system" else args.subject
    print(
        mint_actor_token(
            subject=subject,
            role=args.role,
            secret=settings.agent_actor_secret,
            issuer=settings.agent_actor_issuer,
            audience=settings.agent_actor_audience,
            ttl_seconds=args.ttl,
        )
    )
    return 0


def _wait_until_healthy(url: str, process: subprocess.Popen[bytes], timeout_s: float = 120.0) -> bool:
    import time

    import httpx

    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline and process.poll() is None:
        try:
            if httpx.get(f"{url}/ok", timeout=1.0).status_code == 200:
                return True
        except httpx.HTTPError:
            pass
        time.sleep(1.0)
    return False


def _cmd_dev(args: argparse.Namespace) -> int:
    """Run the Agent Server for development (`langgraph dev`), then register the crons once it is healthy."""
    command = ["langgraph", "dev", "--no-browser", "--port", str(args.port)]
    if args.host:
        command += ["--host", args.host]
    if args.no_reload:
        command.append("--no-reload")
    process = subprocess.Popen(command, cwd=SERVICE_ROOT, env=os.environ.copy())  # noqa: S603
    try:
        url = f"http://localhost:{args.port}"
        if _wait_until_healthy(url, process):
            _cmd_sync_crons(argparse.Namespace(url=url))
        return process.wait()
    except KeyboardInterrupt:
        process.terminate()
        return process.wait()


def _cmd_doctor(args: argparse.Namespace) -> int:
    """Check that the configured models can drive the agents (docs/LOCAL_LLM.md)."""
    from shop_agent import doctor

    return doctor.run(args.profile, live=args.live, suggest=args.suggest_profile)


def _cmd_ingest(args: argparse.Namespace) -> int:
    """Load, split, embed and upsert the knowledge base (data/knowledge and the catalog)."""
    import asyncio

    from shop_agent import wiring
    from shop_agent.adapters.shop_db import ShopReadUnavailable
    from shop_agent.knowledge.ingest import ingest

    settings = get_settings()
    kb = wiring.knowledge_base(settings)
    if kb is None:
        print("DATABASE_URL is not set: nothing to ingest into", file=sys.stderr)
        return 1

    async def run() -> int:
        try:
            reader = (await wiring.shop(settings))[0]
            report = await ingest(kb, reader, reindex=args.reindex)
        except ShopReadUnavailable as exc:
            print(f"documents indexed; the product catalog was not: {exc}", file=sys.stderr)
            return 1
        finally:
            await kb.close()
        print(f"ingested {report.documents} document chunks, {report.catalog} products; pruned {report.pruned}")
        return 0

    return asyncio.run(run())


MARKET_SOURCES = ("fixture", "trends", "competitor_sites")


def _cmd_collect(args: argparse.Namespace) -> int:
    """Read market sources now (the daily `collect` cron's work) and post what they saw, or print it (--dry-run)."""
    import asyncio
    import json

    from shop_agent import wiring
    from shop_agent.graphs import collect
    from shop_agent.tools.deps import ShopDeps

    settings = get_settings()

    async def run() -> int:
        reader, writer = await wiring.shop(settings)
        deps = ShopDeps(reader=reader, writer=writer, model_profile=settings.llm_profile)
        context = collect.CollectContext(
            deps, wiring.market_collectors(settings), wiring.enabled_market_sources(settings.flags)
        )
        out = (
            await collect.build().compile().ainvoke({"sources": args.source, "dry_run": args.dry_run}, context=context)
        )
        if args.dry_run:
            print(json.dumps(out.get("observations", []), ensure_ascii=False, indent=2))
        failed = False
        for result in out.get("results", []):
            if "skipped" in result:
                print(f"{result['source']}: skipped ({result['skipped']})")
                continue
            counts = f"{result['trends']} trend points, {result['competitor_prices']} prices"
            outcome = "dry run, not posted" if args.dry_run else result.get("response") or ""
            print(f"{result['source']} [{result['status']}] {counts}: {result['detail'] or ''} -> {outcome}")
            failed |= not args.dry_run and not result.get("posted")
        return 1 if failed else 0

    return asyncio.run(run())


def _cmd_snapshot(args: argparse.Namespace) -> int:
    """Read the growth views as the read-only role and summarise the snapshot; --check exits 1 on any problem."""
    import asyncio

    from shop_agent.adapters.shop_db import ShopDb
    from shop_agent.tools.deps import utc_now

    settings = get_settings()
    if not settings.shop_read_dsn:
        print("SHOP_READ_DSN is not set (the read-only ci_reader connection)", file=sys.stderr)
        return 1

    async def run() -> int:
        db = ShopDb(settings.shop_read_dsn or "")
        try:
            await db.check(strict=True)  # the role must be read-only
            problems = await db.check_growth()
        except RuntimeError as exc:
            problems = [str(exc)]
        if problems:
            for problem in problems:
                print(f"PROBLEM: {problem}", file=sys.stderr)
            return 1
        snapshot = await db.growth_snapshot(utc_now())
        targets = snapshot.targets
        print(
            f"growth snapshot at {snapshot.taken_at:%Y-%m-%d %H:%M} UTC: {len(snapshot.sales_daily)} days of sales, "
            f"{len(snapshot.catalog)} products, {len(snapshot.promotions)} promotions, "
            f"{len(snapshot.competitor_prices)} competitor prices, {len(snapshot.trends)} trend points, "
            f"{len(snapshot.events)} calendar events, {len(snapshot.sources)} market sources; "
            f"revenue target {targets.revenue_target_vnd if targets else None} "
            f"({targets.revenue_target_source if targets else 'none'})"
        )
        return 0

    return asyncio.run(run())


# Agent API writes that only record data (no grant, nothing approved): the simulations leave them out of their checks.
INGESTION = ("marketing/metrics/sync", "marketing/outcomes", "notifications/admins", "market/observations")


class SimClock:
    """The simulation's time: FakeShop, the graphs and grant expiry all read it."""

    def __init__(self, start: datetime) -> None:
        self._now = start

    def now(self) -> datetime:
        return self._now

    def advance(self, days: int) -> None:
        self._now += timedelta(days=days)


SIMULATION_START = datetime(2026, 9, 29, 2, 0, tzinfo=UTC)


def _auto_decision(thread_id: str, payload: dict[str, Any], now: datetime) -> dict[str, Any]:
    """Approve the recommended option as actor `cli`, with a grant signed like the web gateway signs it."""
    from shop_agent.testing.grants import approve_option

    option = next(o for o in payload["options"] if o["option_id"] == payload["recommended_option_id"])
    grant = approve_option(thread_id=thread_id, option=option, now=int(now.timestamp()), approver="cli")
    return {"type": "approve", "option_id": option["option_id"], "approver": "cli", "grant": grant}


async def simulate_loop(scenario: str, *, auto_approve: bool, rounds: int, days_per_round: int, check: bool) -> int:
    """The whole loop in this process on FakeShop: detect, investigate, review, act, measure, learn."""
    from langgraph.checkpoint.memory import InMemorySaver
    from langgraph.store.memory import InMemoryStore

    from shop_agent import llm
    from shop_agent.adapters.fake_shop import FakeShop
    from shop_agent.agents.kinds import get_kind
    from shop_agent.graphs import improvement, monitor
    from shop_agent.graphs.launchers import InProcessLauncher
    from shop_agent.testing.grants import approval_test_secret
    from shop_agent.tools.deps import ShopDeps

    if scenario != "v1-parity":
        raise ValueError(f"unknown scenario {scenario!r}")
    clock = SimClock(SIMULATION_START)
    shop = FakeShop.seed_demo(clock.now, grant_secret=approval_test_secret())
    deps = ShopDeps(reader=shop, writer=shop, clock=clock.now, model_profile=get_settings().llm_profile)
    spec = llm.embedding_spec()
    store = InMemoryStore(index={"embed": llm.embeddings(), "dims": spec.dims, "fields": ["text"]})
    launcher = InProcessLauncher(improvement.build().compile(checkpointer=InMemorySaver(), store=store), deps)
    tick = monitor.build().compile(store=store)
    context = monitor.MonitorContext(deps, launcher)

    for n in range(1, rounds + 2):  # the last tick only sweeps: due measurements run
        report = await tick.ainvoke({}, context=context)
        await launcher.drain()
        print(
            f"tick {n} ({clock.now():%Y-%m-%d}): opened {len(report.get('opened', []))}, "
            f"woken {len(report.get('woken', []))}, expired {len(report.get('expired', []))}"
        )
        if n > rounds:
            break
        if auto_approve:
            for thread_id, payload in await launcher.interrupted():
                decision = _auto_decision(thread_id, payload, clock.now())
                await launcher.resume(thread_id, decision)
                print(f"  approved {payload['kind']} option {decision['option_id']} ({thread_id[:8]})")
            await launcher.drain()
        clock.advance(days_per_round)
        shop.advance_days(days_per_round)

    threads = {t: await launcher.values(t) for t in launcher.metadata}
    print("\nthreads:")
    for thread_id, values in threads.items():
        verdict = (values.get("measurement") or {}).get("verdict", "")
        print(f"  {thread_id[:8]} {values['opportunity']['kind']:13} {values.get('stage', '?'):10} "
              f"{values.get('outcome', ''):10} {verdict}")  # fmt: skip
    if not check:
        return 0

    problems: list[str] = []
    measured = {
        v["opportunity"]["kind"] for v in threads.values() if v.get("stage") == "closed" and v.get("measurement")
    }
    if not {"dead_stock", "high_returns"} <= measured:
        problems.append(f"expected a closed, measured thread per kind; got {sorted(measured)}")
    end = clock.now()
    for thread_id, values in threads.items():
        acted = values.get("acted_at")
        wait = timedelta(days=get_kind(values["opportunity"]["kind"]).measurement.evaluate_after_days)
        if acted and datetime.fromisoformat(acted) + wait <= end and values.get("stage") != "closed":
            problems.append(f"{thread_id[:8]} acted on {acted[:10]} but is not closed")
        if values.get("outcome") in ("blocked", "failed"):
            problems.append(f"{thread_id[:8]} ended {values['outcome']}")
    refused = [w for w in shop.sent if not w.applied]
    if refused:
        problems.append(
            f"{len(refused)} writes refused by the shop (grant or limits), e.g. {refused[0].idempotency_key}"
        )
    approved = [a["idempotency_key"] for v in threads.values() for a in v.get("approved", []) if v.get("steps")]
    applied = [w.idempotency_key for w in shop.applied() if w.endpoint not in INGESTION]  # not the metrics sync
    if sorted(approved) != sorted(applied):
        problems.append(f"approved steps {len(approved)} but the shop applied {len(applied)} (or other keys)")
    if launcher.errors:
        problems.append(f"failed runs: {launcher.errors}")
    for problem in problems:
        print(f"ASSERT: {problem}", file=sys.stderr)
    print("\nassertions:", "FAILED" if problems else "passed")
    return 1 if problems else 0


GROWTH_START = datetime(2026, 10, 1, 2, 0, tzinfo=UTC)  # 09:00 in Vietnam
TIERS = ("protective", "low", "medium", "high")


def _detected(report: dict[str, Any], launcher: Any) -> set[str]:
    """The kinds a tick saw: opened, deferred or already known (a fingerprint starts with its kind)."""
    fingerprints = [d["fingerprint"] for d in report.get("deferred", [])] + list(report.get("skipped", []))
    return {f.split(":")[0] for f in fingerprints} | {launcher.metadata[t]["kind"] for t in report.get("opened", [])}


async def simulate_growth(scenario: str, *, days: int, seed: int, auto_approve_tier: str | None, check: bool) -> int:
    """The growth agent on FakeShop for `days` days: a monitor tick each morning, the owner (this command) approving
    options up to a tier and rejecting the rest, then the day's sales (FakeWorld, with the levers' true response)."""
    from langgraph.checkpoint.memory import InMemorySaver
    from langgraph.store.memory import InMemoryStore

    from shop_agent import llm
    from shop_agent.adapters.fake_shop import FakeShop
    from shop_agent.adapters.growth_files import GROWTH_DEFAULTS
    from shop_agent.agents.kinds import KINDS
    from shop_agent.domain.growth.snapshot import vn_date
    from shop_agent.graphs import improvement, monitor
    from shop_agent.graphs.launchers import InProcessLauncher
    from shop_agent.testing.grants import approval_test_secret
    from shop_agent.tools.deps import ShopDeps

    clock = SimClock(GROWTH_START)
    shop = FakeShop.seed_demo(clock.now, seed=seed, grant_secret=approval_test_secret())
    shop.scenario = scenario
    deps = ShopDeps(reader=shop, writer=shop, clock=clock.now, model_profile=get_settings().llm_profile)
    spec = llm.embedding_spec()
    store = InMemoryStore(index={"embed": llm.embeddings(), "dims": spec.dims, "fields": ["text"]})
    launcher = InProcessLauncher(improvement.build().compile(checkpointer=InMemorySaver(), store=store), deps)
    tick = monitor.build().compile(store=store)
    context = monitor.MonitorContext(deps, launcher)
    world = await shop._world(clock.now())
    limits = GROWTH_DEFAULTS.prioritize
    problems: list[str] = []
    pending: list[tuple[int, str, str]] = []  # injected (day, kind, name) not detected yet
    shadow_threads: set[str] = set()

    def growth(thread_id: str) -> bool:
        kind = launcher.metadata.get(thread_id, {}).get("kind")
        return kind in KINDS and KINDS[kind].growth

    for day in range(1, days + 1):
        now = clock.now()
        for injection in (i for i in world.scenario.injections if i.day == day):
            pending.append((day, injection.kind, await shop.inject(injection, now)))
        report = await tick.ainvoke({"weekly_plan": vn_date(now).weekday() == 0}, context=context)
        await launcher.drain()
        seen = _detected(report, launcher)
        for entry in list(pending):
            injected_on, kind, name = entry
            if kind in seen or (kind == "roas_breach" and name in report.get("guarded", [])):
                pending.remove(entry)
            elif day > injected_on:  # a day late: the detector (or the guard) missed it
                problems.append(f"injected {kind} ({name}) on day {injected_on} was not detected within a day")
                pending.remove(entry)
        opened = [t for t in report.get("opened", []) if growth(t)]
        if len(opened) > limits.max_new_per_tick:
            problems.append(f"day {day}: opened {len(opened)} growth threads (at most {limits.max_new_per_tick})")
        signals = [i.value for i in await store.asearch(improvement.SIGNALS, limit=1000)]
        open_growth = [v for v in signals if v.get("closed_at") is None and growth(v["thread_id"])]
        if len(open_growth) > limits.max_open_growth_threads:
            problems.append(
                f"day {day}: {len(open_growth)} growth threads open (at most {limits.max_open_growth_threads})"
            )
        decided = 0
        for thread_id, payload in await launcher.interrupted():
            option = next(o for o in payload["options"] if o["option_id"] == payload["recommended_option_id"])
            if auto_approve_tier and TIERS.index(option["tier"]) <= TIERS.index(auto_approve_tier):
                await launcher.resume(thread_id, _auto_decision(thread_id, payload, now))
            else:
                note = f"simulation: above the {auto_approve_tier or 'no'} auto-approve tier"
                await launcher.resume(thread_id, {"type": "reject", "approver": "cli", "note": note})
            decided += 1
        await launcher.drain()
        for thread_id in launcher.metadata:
            if (await launcher.values(thread_id)).get("outcome") == "shadow":
                shadow_threads.add(thread_id)
        budget = shop.marketing.budget()
        if budget.remaining_vnd < 0:
            problems.append(f"day {day}: the ad budget ledger is negative ({budget.remaining_vnd} VND)")
        sold = await shop.sell_day(vn_date(now))
        print(f"day {day:2} ({vn_date(now):%a %d/%m}): opened {len(report.get('opened', []))}, "
              f"deferred {len(report.get('deferred', []))}, guarded {len(report.get('guarded', []))}, "
              f"decided {decided}, sold {sum(sold.values())} units")  # fmt: skip
        clock.advance(1)

    threads = {t: await launcher.values(t) for t in launcher.metadata}
    outcomes: dict[str, int] = {}
    for values in threads.values():
        key = f"{values['opportunity']['kind']}:{values.get('outcome', values.get('stage', '?'))}"
        outcomes[key] = outcomes.get(key, 0) + 1
    print("\nthreads by kind and outcome:", ", ".join(f"{k} {n}" for k, n in sorted(outcomes.items())))
    print(f"outcomes recorded on the web: {len(shop.marketing.outcomes)}")
    if not check:
        return 0

    problems += [f"injected {kind} ({name}) on day {d} was not detected" for d, kind, name in pending]
    refused = [w for w in shop.sent if not w.applied]
    problems += [f"the shop refused {w.endpoint} ({w.idempotency_key})" for w in refused]
    for write in shop.applied():
        if write.grant or write.endpoint in INGESTION or write.endpoint.endswith(("/pause", "/end", "/revert")):
            continue
        thread = threads.get(write.idempotency_key.split(":")[0], {})
        if (thread.get("decision") or {}).get("mode") != "auto":
            problems.append(f"{write.endpoint} ({write.idempotency_key}) ran with no grant and no autonomy decision")
    if not shadow_threads:
        problems.append("no option ran in shadow mode (the scenario puts ads_google in shadow)")
    for thread_id in shadow_threads:
        written = [w.endpoint for w in shop.applied() if w.idempotency_key.startswith(f"{thread_id}:")]
        if written:
            problems.append(f"shadow thread {thread_id[:8]} wrote {written}")
    if launcher.errors:
        problems.append(f"failed runs: {launcher.errors}")
    for problem in problems:
        print(f"ASSERT: {problem}", file=sys.stderr)
    print("\nassertions:", "FAILED" if problems else "passed")
    return 1 if problems else 0


def _cmd_simulate_growth(args: argparse.Namespace) -> int:
    """Run the growth agent in process against FakeShop for a number of days (no server, no database)."""
    import asyncio

    from shop_agent import llm

    if args.profile:
        os.environ["LLM_PROFILE"] = args.profile
        get_settings.cache_clear()
        llm.reset_caches()
    return asyncio.run(
        simulate_growth(
            Path(args.scenario).stem,
            days=args.days,
            seed=args.seed,
            auto_approve_tier=args.auto_approve_tier,
            check=args.check,
        )
    )


def _cmd_simulate(args: argparse.Namespace) -> int:
    """Run the loop in process against FakeShop (no server, no database)."""
    import asyncio

    from shop_agent import llm

    if args.profile:
        os.environ["LLM_PROFILE"] = args.profile
        get_settings.cache_clear()
        llm.reset_caches()
    return asyncio.run(
        simulate_loop(
            args.scenario,
            auto_approve=args.auto_approve,
            rounds=args.rounds,
            days_per_round=args.days_per_round,
            check=args.check,
        )
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="shop-agent", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    dev = sub.add_parser("dev", help="run the Agent Server for development (langgraph dev)")
    dev.add_argument("--port", type=int, default=2024)
    dev.add_argument("--host", default=None)
    dev.add_argument("--no-reload", action="store_true")
    dev.set_defaults(func=_cmd_dev)

    doctor = sub.add_parser("doctor", help="check the model profile (and the models, with --live)")
    doctor.add_argument("--profile", default=None, help="profile to check (default: LLM_PROFILE)")
    doctor.add_argument("--live", action="store_true", help="probe each model: tool call, structured output, context")
    doctor.add_argument("--suggest-profile", action="store_true", help="measure this machine and recommend a profile")
    doctor.set_defaults(func=_cmd_doctor)

    ingest = sub.add_parser("ingest", help="index data/knowledge and the product catalog into pgvector")
    ingest.add_argument("--reindex", action="store_true", help="drop and rebuild (after changing the embedding model)")
    ingest.set_defaults(func=_cmd_ingest)

    mint = sub.add_parser("mint-token", help="print an actor token for the Agent Server (at most 300 s)")
    mint.add_argument("--role", choices=["system", "owner", "manager", "staff"], default="system")
    mint.add_argument("--subject", default="cli", help="the acting user id (ignored for system)")
    mint.add_argument("--ttl", type=int, default=300)
    mint.set_defaults(func=_cmd_mint_token)

    crons = sub.add_parser("sync-crons", help="create or update the Agent Server's crons (idempotent)")
    crons.add_argument("--url", help=f"the Agent Server (default: AGENT_SERVER_URL, else {DEV_SERVER_URL})")
    crons.set_defaults(func=_cmd_sync_crons)

    collect_cmd = sub.add_parser("collect", help="read market sources now and post the observations to the web")
    collect_cmd.add_argument(
        "--source", action="append", choices=MARKET_SOURCES, help="a source to read (repeatable; default: the cron's)"
    )
    collect_cmd.add_argument("--dry-run", action="store_true", help="print the observations instead of posting them")
    collect_cmd.set_defaults(func=_cmd_collect)

    snapshot = sub.add_parser("snapshot", help="read the growth views (analytics.*) as the read-only role")
    snapshot.add_argument("--check", action="store_true", help="exit 1 on a missing view or column (the default)")
    snapshot.set_defaults(func=_cmd_snapshot)

    simulate = sub.add_parser("simulate", help="run the loop in process against FakeShop")
    simulate_sub = simulate.add_subparsers(dest="target", required=True)
    loop = simulate_sub.add_parser("loop", help="the improvement loop (dead stock, high returns)")
    loop.add_argument("--scenario", default="v1-parity", choices=["v1-parity"])
    loop.add_argument("--auto-approve", action="store_true", help="approve the recommended option with a test grant")
    loop.add_argument("--profile", default="scripted", help="LLM profile (default: scripted)")
    loop.add_argument("--rounds", type=int, default=3)
    loop.add_argument("--days-per-round", type=int, default=15)
    loop.add_argument("--assert", dest="check", action="store_true", help="exit 1 unless the loop's invariants hold")
    loop.set_defaults(func=_cmd_simulate)
    growth = simulate_sub.add_parser("growth", help="the growth agent over simulated days (FakeWorld)")
    growth.add_argument("--scenario", default="data/growth/scenarios/q4.yaml", help="a file in data/growth/scenarios")
    growth.add_argument("--days", type=int, default=30)
    growth.add_argument("--seed", type=int, default=7, help="the demo catalog's seed")
    growth.add_argument(
        "--auto-approve-tier", choices=["low", "medium", "high"], help="approve recommended options up to this tier"
    )
    growth.add_argument("--profile", default="scripted", help="LLM profile (default: scripted)")
    growth.add_argument("--assert", dest="check", action="store_true", help="exit 1 unless the growth invariants hold")
    growth.set_defaults(func=_cmd_simulate_growth)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    configure_logging(get_settings().app_env)
    code: int = args.func(args)
    return code


if __name__ == "__main__":
    sys.exit(main())
