"""FastAPI dependency wiring: build the Container once per process, share it across requests."""
from __future__ import annotations

import threading
from functools import lru_cache

from fastapi import Depends, FastAPI, Request

from ci_agent.bootstrap.container import Container, build_container
from ci_agent.interfaces.runs import RunManager


@lru_cache
def get_container() -> Container:
    return build_container()


_runs_lock = threading.Lock()


def runs_for(app: FastAPI, container: Container) -> RunManager:
    """The app's single RunManager for this container (created on first use), so every caller shares one lock."""
    with _runs_lock:
        current = getattr(app.state, "runs", None)
        if current is None or current[0] is not container:
            current = (container, RunManager(container.workflow.coordinator.tick))
            app.state.runs = current
        return current[1]


def get_run_manager(request: Request, container: Container = Depends(get_container)) -> RunManager:
    return runs_for(request.app, container)
