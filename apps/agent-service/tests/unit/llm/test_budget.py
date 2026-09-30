from __future__ import annotations

from datetime import UTC, datetime

import pytest
from langchain.agents import create_agent
from langchain_core.messages import HumanMessage
from langgraph.store.memory import InMemoryStore

from shop_agent.agents.middleware import SPEND_NAMESPACE, BudgetExceeded, BudgetMiddleware
from shop_agent.testing.scripted import ScriptedChatModel

DAY = datetime(2026, 9, 30, 10, 0, tzinfo=UTC)


def expensive(_model: str) -> tuple[float, float]:
    return (1_000_000.0, 1_000_000.0)  # 1 USD per token: any call costs dollars


def agent(budget: BudgetMiddleware, store: InMemoryStore | None = None):
    scripted = ScriptedChatModel(scripts={"default": [{"content": "ok"}]})
    return create_agent(scripted, middleware=[budget], store=store)


def test_refuses_once_the_budget_is_spent() -> None:
    budget = BudgetMiddleware(daily_budget_usd=1.0, prices=expensive, clock=lambda: DAY)
    agent(budget).invoke({"messages": [HumanMessage("x")]})
    with pytest.raises(BudgetExceeded, match="2026-09-30"):
        agent(budget).invoke({"messages": [HumanMessage("x")]})


def test_spend_is_shared_through_the_store() -> None:
    store = InMemoryStore()
    agent(BudgetMiddleware(1.0, expensive, clock=lambda: DAY), store).invoke({"messages": [HumanMessage("x")]})
    item = store.get(SPEND_NAMESPACE, "2026-09-30")
    assert item is not None and item.value["usd"] > 1.0
    with pytest.raises(BudgetExceeded):
        agent(BudgetMiddleware(1.0, expensive, clock=lambda: DAY), store).invoke({"messages": [HumanMessage("x")]})


async def test_async_path_counts_too() -> None:
    budget = BudgetMiddleware(daily_budget_usd=1.0, prices=expensive, clock=lambda: DAY)
    await agent(budget).ainvoke({"messages": [HumanMessage("x")]})
    with pytest.raises(BudgetExceeded):
        await agent(budget).ainvoke({"messages": [HumanMessage("x")]})


def test_free_models_never_hit_the_budget() -> None:
    budget = BudgetMiddleware(daily_budget_usd=0.0001, prices=lambda _m: (0.0, 0.0), clock=lambda: DAY)
    for _ in range(3):
        agent(budget).invoke({"messages": [HumanMessage("x")]})
