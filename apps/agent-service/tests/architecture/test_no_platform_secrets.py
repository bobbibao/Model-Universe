"""Invariant 2: platform tokens (Facebook Page, Meta, Google Ads, TikTok) live only in the web app.

The agent reaches every platform through the web Agent API, so nothing it is configured with may name one: no
setting, no variable in its environment files or compose block, no environment lookup in its code.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

from shop_agent.config import Settings

AGENT = Path(__file__).resolve().parents[2]
REPO = AGENT.parents[1]
PLATFORM = re.compile(r"^(NEXT_PUBLIC_)?(META|FACEBOOK|GOOGLE_ADS|TIKTOK)_|CAPI|EVENTS_TOKEN|PIXEL")


def test_no_setting_names_a_platform() -> None:
    names = [name.upper() for name in Settings.model_fields]
    assert [n for n in names if PLATFORM.search(n)] == []


def test_no_environment_file_names_a_platform() -> None:
    variables = []
    for path in (AGENT / ".env.example", AGENT / "Dockerfile"):
        variables += re.findall(r"^\s*#?\s*([A-Z][A-Z0-9_]+)=", path.read_text("utf-8"), flags=re.MULTILINE)
    compose = yaml.safe_load((REPO / "infra/docker-compose.yml").read_text("utf-8"))
    variables += list(compose["x-agent-env"])
    assert variables, "no variables found: the test would prove nothing"
    assert [v for v in variables if PLATFORM.search(v)] == []


def test_no_code_reads_a_platform_variable() -> None:
    lookups = []
    for path in (AGENT / "src").rglob("*.py"):
        lookups += re.findall(
            r"""(?:environ(?:\.get)?\(|environ\[|getenv\()\s*["']([A-Z0-9_]+)""", path.read_text("utf-8")
        )
    assert [name for name in lookups if PLATFORM.search(name)] == []
