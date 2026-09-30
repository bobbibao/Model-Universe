"""Composition root: builds the concrete dependencies (adapters, stores) from settings.

Graphs register `default_deps` with `shop_agent.tools.deps` at import time, so tools resolve their dependencies even
when a run carries no context (copilot chats, cron runs). Nothing below the graphs layer imports this module.
"""

from __future__ import annotations

from shop_agent.config import Settings, get_settings


def settings() -> Settings:
    return get_settings()
