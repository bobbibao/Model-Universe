"""FastAPI dependency wiring: build the Container once per process, share it across requests."""
from __future__ import annotations

from functools import lru_cache

from ci_agent.bootstrap.container import Container, build_container


@lru_cache
def get_container() -> Container:
    return build_container()
