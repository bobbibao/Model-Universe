"""Runs of the loop (ROADMAP T-09): trigger one, see the status, follow the progress live (SSE).

Every route needs a verified actor with at least the manager role (the web maps every admin to owner).
"""
from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from ci_agent.domain.models.notification import Role
from ci_agent.interfaces.http.auth import require_role
from ci_agent.interfaces.http.dependencies import get_run_manager
from ci_agent.interfaces.runs import RunManager

router = APIRouter(prefix="/runs", tags=["runs"], dependencies=[Depends(require_role(Role.MANAGER))])

SSE_HEARTBEAT_S = 15.0  # a comment line keeps proxies from closing an idle stream
# The actor token is checked when the stream opens; closing after its maximum lifetime makes the client reconnect with
# a fresh one (EventSource reconnects by itself).
SSE_MAX_SECONDS = 300.0
SSE_QUEUE_SIZE = 200


@router.post("", status_code=202)
def trigger_run(runs: RunManager = Depends(get_run_manager)):
    """Run one Detect + advance-all cycle now (the scheduler does this on its interval)."""
    report = runs.run("manual")
    if report is None:
        busy = runs.busy() or {}
        raise HTTPException(409, f"A run is already in progress (started by the {busy.get('trigger', 'agent')} at "
                                 f"{busy.get('started_at', '?')}); wait for it to finish.")
    return {"detected": report.detected, "expired": report.expired, "advanced": report.advanced,
            "errors": report.errors, "skipped": report.skipped}


@router.get("/status")
def run_status(runs: RunManager = Depends(get_run_manager)) -> dict[str, Any]:
    """The run in progress (if any), the last run, the scheduler and the demo settings."""
    return runs.status()


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


@router.get("/events")
async def run_events(request: Request, runs: RunManager = Depends(get_run_manager)) -> StreamingResponse:
    """Server-sent events: `status` first, then run_started / detected / advanced / run_finished / run_failed."""
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(SSE_QUEUE_SIZE)

    def deliver(message: dict[str, Any]) -> None:  # called from the run's thread
        def put() -> None:
            if queue.full():
                queue.get_nowait()  # drop the oldest rather than block the run
            queue.put_nowait(message)
        loop.call_soon_threadsafe(put)

    async def stream() -> AsyncIterator[str]:
        # Subscribed inside the generator, so a client that leaves before the stream starts leaves nothing behind.
        token = runs.subscribe(deliver)
        try:
            yield _sse("status", runs.status())
            deadline = loop.time() + SSE_MAX_SECONDS
            while (remaining := deadline - loop.time()) > 0:
                if await request.is_disconnected():
                    break
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=min(SSE_HEARTBEAT_S, remaining))
                except TimeoutError:
                    yield ": keep-alive\n\n"
                    continue
                yield _sse(str(message.get("event", "message")), message)
        finally:
            runs.unsubscribe(token)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
