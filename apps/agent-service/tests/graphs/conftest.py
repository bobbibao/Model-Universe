"""Graph tests: the real graphs, compiled in process with InMemorySaver/InMemoryStore, the scripted model and
FakeShop (which refuses any shop_change write without a valid grant, like the web)."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
import yaml
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.store.memory import InMemoryStore
from langgraph.types import Command

from shop_agent import llm
from shop_agent.adapters.fake_shop import FakeShop
from shop_agent.config import get_settings
from shop_agent.domain.detectors import default_detectors
from shop_agent.domain.models import Opportunity
from shop_agent.graphs import improvement
from shop_agent.testing.embeddings import HashingEmbedding
from shop_agent.testing.grants import approval_test_secret, approve_option
from shop_agent.testing.scripted import SCRIPTS_DIR_ENV
from shop_agent.tools.deps import ShopDeps
from tests.support.factories import NOW, item, returned


@pytest.fixture(autouse=True)
def scripted_profile(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("LLM_PROFILE", "scripted")
    monkeypatch.delenv("DEMO_MEASURE_AFTER_MINUTES", raising=False)
    get_settings.cache_clear()
    llm.reset_caches()
    yield
    get_settings.cache_clear()
    llm.reset_caches()


@pytest.fixture
def scripts(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Any:
    """Override scripted answers for this test: `scripts({"improvement.investigate.dead_stock": [...]})`."""

    def use(overrides: dict[str, list[dict[str, Any]]]) -> None:
        (tmp_path / "overrides.yaml").write_text(yaml.safe_dump(overrides, allow_unicode=True), "utf-8")
        monkeypatch.setenv(SCRIPTS_DIR_ENV, str(tmp_path))
        llm.reset_caches()

    return use


class Clock:
    def __init__(self, start: datetime) -> None:
        self.at = start

    def __call__(self) -> datetime:
        return self.at

    def advance(self, **delta: float) -> None:
        self.at += timedelta(**delta)


@dataclass
class World:
    clock: Clock
    shop: FakeShop
    deps: ShopDeps
    store: InMemoryStore
    graph: Any
    thread_id: str = "thread-1"
    results: list[dict[str, Any]] = field(default_factory=list)

    @property
    def config(self) -> dict[str, Any]:
        return {"configurable": {"thread_id": self.thread_id}}

    def opportunity(self, kind: str = "dead_stock") -> Opportunity:
        found = [o for d in default_detectors() for o in d.detect(self.shop.snapshot_now(self.clock()), self.clock())]
        return next(o for o in found if o.kind == kind)

    async def start(self, kind: str = "dead_stock") -> dict[str, Any]:
        opportunity = self.opportunity(kind)
        return await self.run({"opportunity": opportunity.model_dump(mode="json")})

    async def run(self, value: Any) -> dict[str, Any]:
        result: dict[str, Any] = await self.graph.ainvoke(value, self.config, context=self.deps)
        self.results.append(result)
        return result

    async def resume(self, decision: dict[str, Any]) -> dict[str, Any]:
        return await self.run(Command(resume=decision))

    async def values(self) -> dict[str, Any]:
        return dict((await self.graph.aget_state(self.config)).values)

    @staticmethod
    def review(result: dict[str, Any]) -> dict[str, Any]:
        [pending] = result["__interrupt__"]
        payload: dict[str, Any] = pending.value
        return payload

    @staticmethod
    def option(payload: dict[str, Any], option_id: str | None = None) -> dict[str, Any]:
        wanted = option_id or payload["recommended_option_id"]
        return next(o for o in payload["options"] if o["option_id"] == wanted)

    def grant(self, payload: dict[str, Any], option_id: str | None = None, args: dict[str, Any] | None = None) -> str:
        option = self.option(payload, option_id)
        return approve_option(thread_id=self.thread_id, option=option, now=int(self.clock().timestamp()), args=args)

    async def approve(self, payload: dict[str, Any], args: dict[str, Any] | None = None) -> dict[str, Any]:
        option = self.option(payload)
        decision = {
            "type": "edit" if args else "approve",
            "option_id": option["option_id"],
            "args": args or {},
            "approver": "owner@test",
            "grant": self.grant(payload, args=args),
        }
        return await self.resume(decision)


def small_shop(clock: Clock) -> FakeShop:
    """Two dead-stock SKUs, one best seller, one SKU with many returns: both kinds, few SKUs (low tier possible)."""
    stock = {
        "OLD1": item("OLD1", days=200, quantity=30, cost=200_000, price=450_000),
        "OLD2": item("OLD2", days=150, quantity=12, cost=150_000, price=390_000, condition="open_box"),
        "BEST": item("BEST", days=10, quantity=60),
        "RET": item("RET", days=20, quantity=25),
    }
    returns = [returned("RET", n=n) for n in range(5)]
    base = {"OLD1": 0.02, "OLD2": 0.03, "BEST": 3.0, "RET": 0.2}
    return FakeShop(stock, returns, base, clock=clock, grant_secret=approval_test_secret())


@pytest.fixture
def world() -> World:
    clock = Clock(NOW)
    shop = small_shop(clock)
    deps = ShopDeps(reader=shop, writer=shop, clock=clock, model_profile="scripted")
    embedding = HashingEmbedding()
    store = InMemoryStore(index={"embed": embedding, "dims": embedding.size, "fields": ["text"]})
    graph = improvement.build().compile(checkpointer=InMemorySaver(), store=store)
    return World(clock, shop, deps, store, graph)
