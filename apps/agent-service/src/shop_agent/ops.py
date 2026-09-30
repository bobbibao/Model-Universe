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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="shop-agent", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    dev = sub.add_parser("dev", help="run the Agent Server for development (langgraph dev)")
    dev.add_argument("--port", type=int, default=2024)
    dev.add_argument("--host", default=None)
    dev.add_argument("--no-reload", action="store_true")
    dev.set_defaults(func=_cmd_dev)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    configure_logging(get_settings().app_env)
    code: int = args.func(args)
    return code


if __name__ == "__main__":
    sys.exit(main())
