#!/usr/bin/env python3
"""Phase gates: the machine-checkable acceptance criteria of the v2 plan, cumulative by phase.

    python scripts/gate.py --phase 3                 # fast + server tiers of phases 0..3
    python scripts/gate.py --phase 3 --tier db       # only the db tier of phases 0..3
    python scripts/gate.py --list

Tiers: fast (no services), server (starts `langgraph dev`), db (needs the variables `scripts/dev/pg-local.sh start`
prints), e2e (needs the running e2e stack and E2E_* variables, see .github/workflows/e2e.yml; CI runs it).
Standard library only, so it runs before any dependency is installed.
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
REDOCLY = "npx -y @redocly/cli@2 lint --config packages/contracts/redocly.yaml"


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
    parser.add_argument("--tier", action="append", choices=["fast", "server", "db", "e2e"])
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
        print(f"set {', '.join(missing)} (db: scripts/dev/pg-local.sh start; e2e: the e2e workflow)", file=sys.stderr)
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
