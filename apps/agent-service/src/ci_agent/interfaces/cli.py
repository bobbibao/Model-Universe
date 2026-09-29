"""Developer CLI: run the whole loop against FakeShop without any external service.

    python -m ci_agent.interfaces.cli simulate --sop-dir data/sop

This is the fastest way to see Detect -> Investigate -> Ask -> Improve -> Act -> Measure -> Learn
end to end, and what e2e tests exercise programmatically.
"""
from __future__ import annotations

import argparse

from ci_agent.bootstrap.demo import build_demo_world
from ci_agent.domain.models.human import AnswerDecision


def simulate(auto_approve: bool, days_per_round: int, rounds: int) -> None:
    world = build_demo_world(echo=True)
    for round_no in range(1, rounds + 1):
        print(f"\n=== round {round_no}: tick ===")
        report = world.workflow.coordinator.tick()
        print("detected:", report.detected, "advanced:", report.advanced, "errors:", report.errors)

        if auto_approve:
            for imp in world.workflow.repo.list_recent(100):
                q = imp.current_question
                if q is None:
                    continue
                from ci_agent.application.use_cases.submit_answer import (
                    Actor,
                    SubmitAnswerCommand,
                )
                from ci_agent.domain.models.notification import Role
                top = q.recommended_option_id or q.options[0].option_id
                world.workflow.coordinator.submit_answer(SubmitAnswerCommand(
                    q.id, AnswerDecision.APPROVE, Actor("bob", Role.MANAGER, "cli"), top))
                print(f"auto-approved {imp.id} ({imp.signal.kind}) with option {top}")

        print(f"advancing the clock by {days_per_round} day(s)...")
        world.clock.advance(days=days_per_round)
        world.shop.advance_days(days_per_round)
        world.workflow.coordinator.tick()  # lets ACT_FAILED retries and due Measure phases run

    print("\n=== final state ===")
    for imp in world.workflow.repo.list_recent(100):
        print(f"{imp.id[:8]} {imp.signal.kind:14s} {imp.status.value:12s}",
             imp.measurement.verdict.value if imp.measurement else "")


def mint_actor(user_id: str, role: str, ttl_seconds: int) -> None:
    """Print an actor token like the web proxy mints, for calling the API with curl during development."""
    from ci_agent.config.settings import get_settings
    from ci_agent.domain.models.notification import Role
    from ci_agent.infrastructure.system.clock import SystemClock
    from ci_agent.interfaces.http.auth import mint_actor_token

    print(mint_actor_token(user_id, Role(role), get_settings(), SystemClock().now(), ttl_seconds))


def main() -> None:
    parser = argparse.ArgumentParser(prog="ci_agent")
    sub = parser.add_subparsers(dest="command", required=True)
    sim = sub.add_parser("simulate", help="Run the full loop against FakeShop")
    sim.add_argument("--auto-approve", action="store_true", help="Approve every question with the top option")
    sim.add_argument("--days-per-round", type=int, default=15)
    sim.add_argument("--rounds", type=int, default=3)
    mint = sub.add_parser("mint-actor", help="Print a short-lived actor token (uses AGENT_ACTOR_SECRET)")
    mint.add_argument("--user", required=True, help="Web user id (the token's sub)")
    mint.add_argument("--role", default="owner", choices=["staff", "manager", "owner"])
    mint.add_argument("--ttl", type=int, default=300, help="Lifetime in seconds (max 300)")
    args = parser.parse_args()
    if args.command == "simulate":
        simulate(args.auto_approve, args.days_per_round, args.rounds)
    elif args.command == "mint-actor":
        mint_actor(args.user, args.role, args.ttl)


if __name__ == "__main__":
    main()
