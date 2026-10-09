"""Run an eval suite against a model profile and gate on the stored baseline (.claude/skills/run-evals).

    python -m evals.runner --suite smoke --profile scripted --gate
    python -m evals.runner --suite growth --profile anthropic --gate
    python -m evals.runner --suite smoke --profile local --update-baseline
    python -m evals.runner --suite all --profile anthropic openai google local-large --report evals/reports/bakeoff.md

The gate fails when any `critical` case fails or the pass rate is more than 5 points below
`evals/baselines/<suite>-<profile>.json`. The LLM judge (cases with `judge:`) is skipped, not failed, when the judge
profile's key is missing.
"""

from __future__ import annotations

import argparse
import asyncio
import importlib
import json
import os
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml

from evals.evaluators import CHECKS, CaseOutput, Check

EVALS_DIR = Path(__file__).resolve().parent
TOLERANCE_POINTS = 5.0
PROVIDER_KEYS = {"anthropic": "ANTHROPIC_API_KEY", "openai": "OPENAI_API_KEY", "google_genai": "GOOGLE_API_KEY"}


def load_cases(suite: str) -> list[dict[str, Any]]:
    path = EVALS_DIR / "suites" / suite / "scenarios.yaml"
    cases: list[dict[str, Any]] = yaml.safe_load(path.read_text("utf-8"))
    return cases


def judge_available(profile: str) -> bool:
    import shop_agent.llm as llm

    spec = llm.get_profile(profile).roles[llm.ModelRole.JUDGE]
    key = PROVIDER_KEYS.get(spec.provider)
    return spec.provider != llm.SCRIPTED and (key is None or bool(os.environ.get(key)))


def run_judge(output: CaseOutput, rubric: str, profile: str) -> Check:
    if not judge_available(profile):
        return Check(True, skipped=True, detail="judge model unavailable (no key or scripted profile)")
    from openevals.llm import create_llm_as_judge

    import shop_agent.llm as llm

    evaluator = create_llm_as_judge(
        prompt="Rubric:\n" + rubric + "\n\nAnswer to grade:\n{outputs}\n\nDoes the answer satisfy the rubric?",
        judge=llm.chat_model(llm.ModelRole.JUDGE, profile),
        feedback_key="rubric",
    )
    results = evaluator(outputs=output.final_text or json.dumps(output.structured, default=str))
    result = results[0] if isinstance(results, list) else results
    return Check(bool(result["score"]), str(result.get("comment") or "")[:300])


async def run_case(suite: str, case: dict[str, Any], profile: str) -> dict[str, Any]:
    target = importlib.import_module(f"evals.suites.{suite}.target")
    started = time.monotonic()
    try:
        output: CaseOutput = await asyncio.wait_for(
            target.run_case(case, profile), timeout=float(case.get("timeout_seconds", 180))
        )
    except Exception as exc:
        return {
            "id": case["id"],
            "critical": bool(case.get("critical")),
            "passed": False,
            "seconds": round(time.monotonic() - started, 2),
            "error": repr(exc)[:500],
        }
    checks: dict[str, dict[str, Any]] = {}
    for name, expected in (case.get("expect") or {}).items():
        check = CHECKS[name](output, expected)
        checks[name] = {"passed": check.passed, "skipped": check.skipped, "detail": check.detail}
    if case.get("judge"):
        judged = run_judge(output, str(case["judge"]), profile)
        checks["judge"] = {"passed": judged.passed, "skipped": judged.skipped, "detail": judged.detail}
    return {
        "id": case["id"],
        "critical": bool(case.get("critical")),
        "passed": all(c["passed"] for c in checks.values()),
        "seconds": round(time.monotonic() - started, 2),
        "checks": checks,
    }


def gate(result: dict[str, Any], baseline: dict[str, Any] | None) -> list[str]:
    problems = [f"critical case failed: {c['id']}" for c in result["cases"] if c["critical"] and not c["passed"]]
    if baseline is not None and result["pass_rate"] < baseline["pass_rate"] - TOLERANCE_POINTS:
        problems.append(f"pass rate {result['pass_rate']:.1f}% is below the baseline {baseline['pass_rate']:.1f}%")
    return problems


async def run_suite(suite: str, profile: str) -> dict[str, Any]:
    os.environ["LLM_PROFILE"] = profile  # the suite's agents use the active profile
    from shop_agent.config import get_settings

    get_settings.cache_clear()
    cases = []
    for case in load_cases(suite):
        result = await run_case(suite, case, profile)
        cases.append(result)
        failure = result.get("error") or "; ".join(
            f"{name}: {check['detail']}" for name, check in result.get("checks", {}).items() if not check["passed"]
        )
        print(f"[{suite}/{profile}] {result['id']}: {'PASS' if result['passed'] else 'FAIL'} {failure}", flush=True)
    passed = sum(1 for c in cases if c["passed"])
    return {
        "suite": suite,
        "profile": profile,
        "finished_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "pass_rate": 100.0 * passed / len(cases) if cases else 0.0,
        "passed": passed,
        "total": len(cases),
        "cases": cases,
    }


def suite_names(name: str) -> list[str]:
    """One suite, or every suite under `evals/suites/` for `all`."""
    if name != "all":
        return [name]
    return sorted(path.parent.name for path in (EVALS_DIR / "suites").glob("*/scenarios.yaml"))


def markdown_report(results: list[dict[str, Any]]) -> str:
    """Pass rates, one row per suite and one column per profile, then every failed case (the bake-off's table)."""
    profiles = list(dict.fromkeys(r["profile"] for r in results))
    suites = list(dict.fromkeys(r["suite"] for r in results))
    by_key = {(r["suite"], r["profile"]): r for r in results}
    lines = ["# Eval results", "", "| Suite | " + " | ".join(profiles) + " |", "|---|" + "---|" * len(profiles)]
    for suite in suites:
        cells = [by_key[(suite, p)] for p in profiles]
        lines.append(
            f"| {suite} | " + " | ".join(f"{r['passed']}/{r['total']} ({r['pass_rate']:.0f}%)" for r in cells) + " |"
        )
    failed = [
        f"- {r['profile']} / {r['suite']}: {c['id']}{' (critical)' if c['critical'] else ''}"
        for r in results
        for c in r["cases"]
        if not c["passed"]
    ]
    return "\n".join([*lines, "", "## Failed cases", "", *(failed or ["None."])]) + "\n"


async def run_all(suites: list[str], profiles: list[str]) -> list[dict[str, Any]]:
    return [await run_suite(suite, profile) for profile in profiles for suite in suites]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--suite", required=True, help="a suite name, or `all`")
    parser.add_argument("--profile", nargs="+", default=[os.environ.get("LLM_PROFILE", "scripted")])
    parser.add_argument("--gate", action="store_true")
    parser.add_argument("--update-baseline", action="store_true")
    parser.add_argument("--report", type=Path, default=None, help="also write a Markdown summary here")
    args = parser.parse_args(argv)

    results = asyncio.run(run_all(suite_names(args.suite), args.profile))
    results_dir = EVALS_DIR / "results"
    results_dir.mkdir(exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    problems: list[str] = []
    for result in results:
        suite, profile = result["suite"], result["profile"]
        out = results_dir / f"{suite}-{profile}-{stamp}.json"
        out.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
        for case in result["cases"]:
            mark = "PASS" if case["passed"] else "FAIL"
            failed = "; ".join(f"{n}: {c['detail']}" for n, c in case.get("checks", {}).items() if not c["passed"])
            print(f"{mark}  {'*' if case['critical'] else ' '} {case['id']}  {case.get('error') or failed}")
        print(f"\n{suite} on {profile}: {result['passed']}/{result['total']} ({result['pass_rate']:.1f}%)\n")

        baseline_path = EVALS_DIR / "baselines" / f"{suite}-{profile}.json"
        if args.update_baseline:
            baseline = {"pass_rate": result["pass_rate"], "updated_at": result["finished_at"]}
            baseline_path.write_text(json.dumps(baseline, indent=2) + "\n", encoding="utf-8")
            print(f"baseline written: {baseline_path}")
        if args.gate:
            stored: dict[str, Any] | None = (
                json.loads(baseline_path.read_text(encoding="utf-8")) if baseline_path.exists() else None
            )
            problems += [f"{suite} on {profile}: {problem}" for problem in gate(result, stored)]
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(markdown_report(results), encoding="utf-8")
        print(f"report written: {args.report}")
    for problem in problems:
        print(f"GATE: {problem}", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
