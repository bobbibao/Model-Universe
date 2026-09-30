"""How `monitor` starts and resumes `improvement` threads.

`SdkLauncher` talks to the Agent Server it runs in (`get_client()` without a URL is the in-process loopback):
deterministic thread ids with `if_exists="do_nothing"`, runs with `multitask_strategy="reject"` (one active run per
thread). `InProcessLauncher` does the same against a graph compiled in this process (simulate, graph tests); like
`runs.create` it only queues the run, and `drain()` executes the queue after the tick.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from typing import Any, Protocol

from langgraph.types import Command
from langgraph_sdk import get_client
from langgraph_sdk.client import LangGraphClient
from langgraph_sdk.errors import ConflictError

from shop_agent.logging import get_logger

logger = get_logger(__name__)

IMPROVEMENT = "improvement"
SEARCH_LIMIT = 100


class ThreadLauncher(Protocol):
    async def open(self, thread_id: str, *, input: Mapping[str, Any], metadata: Mapping[str, Any]) -> bool:
        """Create the thread if it does not exist and start a run; False when a run is already active."""
        ...

    async def wake(self, thread_id: str, reason: str) -> bool:
        """Start a run with `{"wake": reason}`: the graph enters where the thread's stage says (e.g. measure)."""
        ...

    async def resume(self, thread_id: str, decision: Mapping[str, Any]) -> bool:
        """Resume an interrupted review with a decision."""
        ...

    async def retry(self, thread_id: str) -> bool:
        """Re-run the step that failed (a run with no input continues from the last checkpoint)."""
        ...

    async def stale_reviews(self, now: datetime) -> list[str]:
        """Interrupted improvement threads whose review has expired."""
        ...

    async def failed(self) -> list[str]:
        """Improvement threads whose last run ended in an error."""
        ...


def _expired(values: Mapping[str, Any] | None, now: datetime) -> bool:
    expires_at = (values or {}).get("review_expires_at")
    return bool(expires_at) and datetime.fromisoformat(str(expires_at)) <= now


class SdkLauncher:
    def __init__(self, client: LangGraphClient | None = None) -> None:
        self._client = client

    @property
    def client(self) -> LangGraphClient:
        if self._client is None:
            self._client = get_client()
        return self._client

    async def _run(self, thread_id: str, **kwargs: Any) -> bool:
        try:
            await self.client.runs.create(thread_id, IMPROVEMENT, multitask_strategy="reject", **kwargs)
        except ConflictError:
            logger.info("run already active; skipped", thread_id=thread_id)
            return False
        return True

    async def open(self, thread_id: str, *, input: Mapping[str, Any], metadata: Mapping[str, Any]) -> bool:
        await self.client.threads.create(thread_id=thread_id, if_exists="do_nothing", metadata=dict(metadata))
        return await self._run(thread_id, input=dict(input))

    async def wake(self, thread_id: str, reason: str) -> bool:
        return await self._run(thread_id, input={"wake": reason})

    async def resume(self, thread_id: str, decision: Mapping[str, Any]) -> bool:
        return await self._run(thread_id, command={"resume": dict(decision)})

    async def retry(self, thread_id: str) -> bool:
        return await self._run(thread_id, input=None)

    async def stale_reviews(self, now: datetime) -> list[str]:
        threads = await self.client.threads.search(
            status="interrupted", metadata={"graph": IMPROVEMENT}, limit=SEARCH_LIMIT
        )
        return [t["thread_id"] for t in threads if _expired(t.get("values"), now)]

    async def failed(self) -> list[str]:
        threads = await self.client.threads.search(status="error", metadata={"graph": IMPROVEMENT}, limit=SEARCH_LIMIT)
        return [t["thread_id"] for t in threads]


class InProcessLauncher:
    def __init__(self, graph: Any, context: Any) -> None:
        self.graph = graph  # improvement, compiled with a checkpointer and the monitor's store
        self.context = context
        self.metadata: dict[str, dict[str, Any]] = {}
        self.errors: dict[str, str] = {}
        self._queue: list[tuple[str, Any]] = []

    @staticmethod
    def config(thread_id: str) -> dict[str, Any]:
        return {"configurable": {"thread_id": thread_id}}

    def _enqueue(self, thread_id: str, value: Any) -> bool:
        if any(queued == thread_id for queued, _ in self._queue):
            return False  # multitask_strategy="reject"
        self._queue.append((thread_id, value))
        return True

    async def open(self, thread_id: str, *, input: Mapping[str, Any], metadata: Mapping[str, Any]) -> bool:
        self.metadata.setdefault(thread_id, dict(metadata))
        return self._enqueue(thread_id, dict(input))

    async def wake(self, thread_id: str, reason: str) -> bool:
        return self._enqueue(thread_id, {"wake": reason})

    async def resume(self, thread_id: str, decision: Mapping[str, Any]) -> bool:
        return self._enqueue(thread_id, Command(resume=dict(decision)))

    async def retry(self, thread_id: str) -> bool:
        return self._enqueue(thread_id, None)

    async def interrupted(self) -> list[tuple[str, dict[str, Any]]]:
        """(thread id, review payload) of every thread waiting for a decision."""
        pending = []
        for thread_id in self.metadata:
            state = await self.graph.aget_state(self.config(thread_id))
            if state.interrupts:
                pending.append((thread_id, state.interrupts[0].value))
        return pending

    async def values(self, thread_id: str) -> dict[str, Any]:
        state = await self.graph.aget_state(self.config(thread_id))
        return dict(state.values)

    async def stale_reviews(self, now: datetime) -> list[str]:
        stale = []
        for thread_id, _ in await self.interrupted():
            if _expired(await self.values(thread_id), now):
                stale.append(thread_id)
        return stale

    async def failed(self) -> list[str]:
        return list(self.errors)

    async def drain(self) -> None:
        """Run everything queued, in order, like the server's background runs (runs may queue more)."""
        while self._queue:
            thread_id, value = self._queue.pop(0)
            try:
                await self.graph.ainvoke(value, self.config(thread_id), context=self.context)
                self.errors.pop(thread_id, None)
            except Exception as exc:  # a failed run leaves its checkpoint, like on the server; the sweep retries it
                self.errors[thread_id] = repr(exc)
                logger.warning("improvement run failed", thread_id=thread_id, error=repr(exc))
