"""`shop-agent` command line: development server, simulations, checks and operations.

Subcommands are added phase by phase (docs/ROADMAP.md).
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from collections.abc import Sequence
from pathlib import Path

from shop_agent.config import get_settings
from shop_agent.logging import configure_logging

SERVICE_ROOT = Path(__file__).resolve().parents[2]


def _cmd_dev(args: argparse.Namespace) -> int:
    """Run the Agent Server for development (`langgraph dev`)."""
    command = ["langgraph", "dev", "--no-browser", "--port", str(args.port)]
    if args.host:
        command += ["--host", args.host]
    if args.no_reload:
        command.append("--no-reload")
    return subprocess.call(command, cwd=SERVICE_ROOT, env=os.environ.copy())  # noqa: S603


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

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    configure_logging(get_settings().app_env)
    code: int = args.func(args)
    return code


if __name__ == "__main__":
    sys.exit(main())
