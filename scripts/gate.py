#!/usr/bin/env python3
"""Phase gates: the machine-checkable acceptance criteria of the v2 plan, cumulative by phase.

    python scripts/gate.py --phase 3                 # fast + server tiers of phases 0..3
    python scripts/gate.py --phase 3 --tier db       # only the db tier of phases 0..3
    python scripts/gate.py --list

Tiers: fast (no services), server (starts `langgraph dev`), db (needs the variables `scripts/dev/pg-local.sh start`
prints), e2e (needs the running e2e stack and E2E_* variables, docs/DEMO.md section 3), runtime (starts Aegra with
Redis on the db tier's Postgres), security (gitleaks, network for the advisory databases), hosted (the owner's
ANTHROPIC_API_KEY: real models).
Standard library only, so it runs before any dependency is installed. There is no hosted CI: this script is the
verification (the owner dropped GitHub Actions on 2026-10-02).
"""

from __future__ import annotations

import argparse
import os
import shlex
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
AGENT = "apps/agent-service"
WEB = "apps/web-ecommerce"
COMPOSE_CONFIG = "docker compose -f infra/docker-compose.yml --env-file infra/.env.example config -q"
COMPOSE_PROFILES = (
    "docker compose -f infra/docker-compose.yml --env-file infra/.env.example --profile e2e --profile prod-like "
    "--profile local-llm config -q"
)
PIP_AUDIT = (
    "set -o pipefail; uv export --frozen --all-extras --no-hashes --no-emit-project -q "
    "| uvx pip-audit==2.10.1 -r /dev/stdin --disable-pip --no-deps --progress-spinner off"
)
REDOCLY = "npx -y @redocly/cli@2 lint --config packages/contracts/redocly.yaml"
V1_NAMES = (
    "ci_agent|CiConsoleService|CiEventService|AgentEvents|ci_event|ci_notification|ci_recipients|AGENT_EVENTS_SECRET|"
    "toCiRole|CiRole"
)
V1_GONE = (
    f"test ! -e {AGENT}/legacy && ! git grep -nIE '{V1_NAMES}' -- apps packages infra scripts CLAUDE.md "
    "README.md ':!scripts/gate.py'"
)


@dataclass(frozen=True)
class Check:
    phase: int
    tier: str
    name: str
    command: str
    cwd: str = "."
    needs: tuple[str, ...] = ()  # environment variables the check requires


CHECKS: tuple[Check, ...] = (
    # Phase 0: foundation
    Check(0, "fast", "agent: uv sync", "uv sync --frozen --all-extras --python 3.12", AGENT),
    Check(0, "fast", "agent: poe check (ruff, mypy, import-linter, pytest)", "uv run poe check", AGENT),
    Check(0, "fast", "agent: v1 package absent from src", "test -z \"$(git ls-files src | grep ci_agent)\"", AGENT),
    Check(0, "fast", "infra: compose config", COMPOSE_CONFIG),
    Check(0, "fast", "contracts: redocly lint", REDOCLY),
    Check(0, "server", "agent: dev server smoke", "uv run pytest -q -m server tests/server/test_dev_server_smoke.py", AGENT),
    # Phase 1: LLM provider layer
    Check(1, "fast", "agent: LLM layer unit tests", "uv run pytest -q tests/unit/llm tests/unit/test_doctor.py", AGENT),
    Check(1, "fast", "agent: doctor on the scripted profile", "uv run shop-agent doctor --profile scripted --live", AGENT),
    Check(1, "fast", "agent: smoke evals (scripted)", "uv run python -m evals.runner --suite smoke --profile scripted --gate", AGENT),
    # Phase 2: domain, adapters, tools, knowledge
    Check(
        2,
        "fast",
        "agent: unit, tool and contract tests; domain coverage >= 90%",
        "uv run pytest -q tests/unit tests/tools tests/contract --cov=shop_agent.domain --cov-fail-under=90",
        AGENT,
    ),
    Check(
        2,
        "db",
        "agent: knowledge base and shop views on Postgres",
        "uv run pytest -q -m db tests/integration",
        AGENT,
        needs=("AGENT_TEST_DATABASE_URL", "PG_SUPERUSER_URL"),
    ),
    # Phase 3: the loop at v1 parity
    Check(3, "fast", "agent: graph invariant tests", "uv run pytest -q tests/graphs", AGENT),
    Check(
        3,
        "fast",
        "agent: simulate the loop with assertions",
        "uv run shop-agent simulate loop --scenario v1-parity --auto-approve --assert",
        AGENT,
    ),
    Check(3, "fast", "agent: loop evals (scripted)", "uv run python -m evals.runner --suite loop --profile scripted --gate", AGENT),
    Check(
        3,
        "server",
        "agent: loop and crons on the dev server",
        "uv run pytest -q -m server tests/server/test_loop_on_dev_server.py tests/server/test_crons_on_dev_server.py",
        AGENT,
    ),
    # Phase 4: web gateway and console on the SDKs, automated demo
    Check(
        4,
        "fast",
        "web: lint, types, unit tests (gateway, grants, test vectors), build",
        "yarn install --immutable && yarn lint && yarn type-check && yarn test && yarn build",
        WEB,
    ),
    Check(4, "fast", "v1 removed: no legacy/ and no v1 names left", V1_GONE),
    Check(4, "server", "agent: every server test with auth on", "uv run pytest -q -m server tests/server", AGENT),
    Check(4, "db", "web: database tests (seed and views)", "yarn test:db", WEB, needs=("TEST_DB_NAME",)),
    Check(
        4,
        "e2e",
        "web: Playwright @demo on the running stack",
        "yarn e2e --grep @demo",
        WEB,
        needs=("E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD", "E2E_ALLOW_WRITES"),
    ),
    # Phase 5: growth data foundation
    Check(
        5,
        "fast",
        "agent: growth snapshot, read tools, market collectors and collect graph (no network)",
        "uv run pytest -q tests/unit/growth tests/unit/market tests/tools/test_growth_reads.py "
        "tests/graphs/test_collect.py tests/contract/test_growth_contract.py",
        AGENT,
    ),
    Check(
        5,
        "fast",
        "agent: collect the fixture source (dry run)",
        "SHOP_ADAPTER=fake uv run shop-agent collect --source fixture --dry-run",
        AGENT,
    ),
    Check(
        5,
        "e2e",
        "agent: every growth view readable as the read-only role",
        "uv run shop-agent snapshot --check",
        AGENT,
        needs=("SHOP_READ_DSN",),
    ),
    # Phase 6: growth hands (Agent API, platforms, web enforcement)
    Check(
        6,
        "fast",
        "agent: limit vectors, ActionSpec schemas, promotion compliance, no platform secrets",
        "uv run pytest -q tests/contract tests/architecture tests/unit/adapters/test_fake_marketing.py",
        AGENT,
    ),
    Check(
        6,
        "fast",
        "web: limit vectors, platform request mapping (nock, jest.mock), marketing configuration",
        "yarn test --testPathPatterns 'limits.vectors|platform-mapping|marketing-config'",
        WEB,
    ),
    Check(
        6,
        "db",
        "web: Agent API promotions, posts, ads, grants, ledger concurrency, kill switch, legal max, conversions",
        "yarn test:db --testPathPatterns 'agent-api|approval-grant|budget-ledger|kill-switch|legal-max|conversions'",
        WEB,
        needs=("TEST_DB_NAME",),
    ),
    # Phase 7: growth brain (decision engine, brand safety, autonomy ramp, measurement)
    Check(
        7,
        "fast",
        "agent: growth-domain coverage at least 90% (the six named properties included)",
        "uv run pytest -q --cov=shop_agent.domain.growth --cov-fail-under=90",
        AGENT,
    ),
    Check(
        7,
        "fast",
        "agent: growth graph tests and the bidding switch",
        "uv run pytest -q tests/graphs/test_growth_improvement.py tests/graphs/test_growth_monitor.py "
        "tests/unit/growth/test_bidding_switch.py tests/graphs/test_named_invariants.py",
        AGENT,
    ),
    Check(
        7,
        "fast",
        "agent: simulate growth, Q4 scenario, 90 days",
        "uv run shop-agent simulate growth --scenario data/growth/scenarios/q4.yaml --days 90 --seed 7 "
        "--auto-approve-tier low --assert",
        AGENT,
    ),
    Check(
        7,
        "fast",
        "agent: growth evals (scripted)",
        "uv run python -m evals.runner --suite growth --profile scripted --gate",
        AGENT,
    ),
    Check(
        7, "fast", "web: step-up approval for high-tier grants", "yarn test --testPathPatterns 'step-up-approval'", WEB
    ),
    Check(
        7,
        "db",
        "web: autonomy ramp gate and the growth scorecard",
        "yarn test:db --testPathPatterns 'ramp-gate|growth-scorecard'",
        WEB,
        needs=("TEST_DB_NAME",),
    ),
    # Phase 8: copilot (deep agent, approvals of its write tools, subagents, memory, daily briefing)
    Check(
        8,
        "fast",
        "agent: copilot graph tests and the write-tool contract vectors",
        "uv run pytest -q tests/graphs/test_assistant.py tests/contract/test_copilot_vectors.py "
        "tests/tools/test_writes.py",
        AGENT,
    ),
    Check(
        8,
        "server",
        "agent: copilot approval on the dev server (pause, grant in state, exactly the approved body)",
        "uv run pytest -q -m server tests/server/test_copilot_on_dev_server.py",
        AGENT,
    ),
    Check(
        8,
        "fast",
        "agent: copilot evals (scripted)",
        "uv run python -m evals.runner --suite copilot --profile scripted --gate",
        AGENT,
    ),
    Check(
        8,
        "fast",
        "web: copilot approvals through the gateway and the write-tool vectors",
        "yarn test --testPathPatterns 'copilot'",
        WEB,
    ),
    Check(
        8,
        "db",
        "agent: the analyst's SQL is read-only and capped",
        "uv run pytest -q -m db tests/integration/test_shop_db.py",
        AGENT,
        needs=("PG_SUPERUSER_URL",),
    ),
    # Phase 9: hardening (production runtime, durability, tracing, security, eval gating)
    Check(
        9,
        "fast",
        "agent: tracing (Langfuse only with keys, masking), traceparent, launchers and crons on both runtimes",
        "uv run pytest -q tests/unit/test_tracing.py tests/unit/test_launchers.py tests/unit/test_crons.py "
        "tests/unit/adapters/test_shop_api.py",
        AGENT,
    ),
    Check(
        9,
        "fast",
        "agent: every eval suite (scripted; injection cases are critical)",
        "uv run python -m evals.runner --suite all --profile scripted --gate",
        AGENT,
    ),
    Check(9, "fast", "infra: compose config with every profile (prod-like: Aegra, Redis)", COMPOSE_PROFILES),
    Check(
        9,
        "runtime",
        "agent: Aegra: a crash in Act resumes with exactly-once writes; crons fire on schedule only",
        "uv run pytest -q -m runtime tests/runtime",
        AGENT,
        needs=("PG_SUPERUSER_URL", "AGENT_TEST_DATABASE_URL"),
    ),
    Check(
        9, "security", "repo: no secret in the git history (gitleaks)", "gitleaks detect --source . --no-banner --redact"
    ),
    Check(9, "security", "agent: no known vulnerability in the locked Python packages", PIP_AUDIT, AGENT),
    Check(
        9, "security", "web: no high or critical advisory", "yarn npm audit --all --recursive --severity high", WEB
    ),
    Check(
        9,
        "hosted",
        "agent: the anthropic profile's models answer tool calls and structured output",
        "uv run shop-agent doctor --profile anthropic --live",
        AGENT,
        needs=("ANTHROPIC_API_KEY",),
    ),
    Check(
        9,
        "hosted",
        "agent: every eval suite on the anthropic profile",
        "uv run python -m evals.runner --suite all --profile anthropic --gate",
        AGENT,
        needs=("ANTHROPIC_API_KEY",),
    ),
)


def run(check: Check) -> tuple[bool, float]:
    started = time.monotonic()
    result = subprocess.run(  # noqa: S603 - fixed commands from this file
        ["bash", "-c", check.command], cwd=REPO / check.cwd, env=os.environ.copy(), check=False
    )
    return result.returncode == 0, time.monotonic() - started


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--phase", type=int, default=max(c.phase for c in CHECKS))
    tier_names = ["fast", "server", "db", "e2e", "runtime", "security", "hosted"]
    parser.add_argument("--tier", action="append", choices=tier_names)
    parser.add_argument("--list", action="store_true", help="print the checks and exit")
    args = parser.parse_args()
    tiers = args.tier or ["fast", "server"]
    selected = [c for c in CHECKS if c.phase <= args.phase and c.tier in tiers]

    if args.list:
        for c in selected:
            print(f"P{c.phase} {c.tier:6} {c.name}\n    cd {c.cwd} && {c.command}")
        return 0
    missing = sorted({n for c in selected for n in c.needs if not os.environ.get(n)})
    if missing:
        hints = "db and runtime: scripts/dev/pg-local.sh start; e2e: docs/DEMO.md section 3; hosted: the owner's key"
        print(f"set {', '.join(missing)} ({hints})", file=sys.stderr)
        return 2

    results: list[tuple[Check, bool, float]] = []
    for check in selected:
        print(f"\n=== P{check.phase} [{check.tier}] {check.name}\n$ cd {check.cwd} && {shlex.quote(check.command)}")
        ok, seconds = run(check)
        results.append((check, ok, seconds))
    print("\n" + "=" * 100)
    for check, ok, seconds in results:
        print(f"{'PASS' if ok else 'FAIL'}  P{check.phase} {check.tier:6} {seconds:6.1f}s  {check.name}")
    failed = [c for c, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
