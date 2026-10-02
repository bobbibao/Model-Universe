"""Agent middleware: the per-role stack (limits, retries, fallback) and a daily spend budget.

The budget counts USD per UTC day from each model response's `usage_metadata` and the profile's price table. Once the
day's budget is spent, model calls raise `BudgetExceeded`: the run fails, the thread keeps its checkpoint, and the next
tick retries. Spend is kept in the LangGraph Store (`("llm_spend",)`, key = date) when the run has one, so every run
and every process shares it; without a store it is kept in memory.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, date, datetime
from typing import Any

from langchain.agents.middleware import (
    AgentMiddleware,
    ModelCallLimitMiddleware,
    ModelRequest,
    ModelResponse,
    ModelRetryMiddleware,
    ToolCallLimitMiddleware,
    ToolRetryMiddleware,
)
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage
from langgraph.store.base import BaseStore

SPEND_NAMESPACE = ("llm_spend",)
PriceLookup = Callable[[str], tuple[float, float]]
Clock = Callable[[], datetime]


class BudgetExceeded(RuntimeError):
    """The day's LLM budget is spent; the run stops and a later tick retries."""


def model_name_of(model: BaseChatModel | Any) -> str:
    for attribute in ("model", "model_name", "model_id"):
        value = getattr(model, attribute, None)
        if isinstance(value, str) and value:
            return value
    return type(model).__name__


def response_cost(response: ModelResponse | AIMessage, model: str, prices: PriceLookup) -> float:
    messages = [response] if isinstance(response, AIMessage) else list(response.result)
    input_price, output_price = prices(model)
    total = 0.0
    for message in messages:
        usage = getattr(message, "usage_metadata", None)
        if usage:
            total += usage.get("input_tokens", 0) * input_price + usage.get("output_tokens", 0) * output_price
    return total / 1_000_000


class BudgetMiddleware(AgentMiddleware[Any, Any]):
    def __init__(self, daily_budget_usd: float, prices: PriceLookup, clock: Clock | None = None) -> None:
        super().__init__()
        self.daily_budget_usd = daily_budget_usd
        self.prices = prices
        self.clock = clock or (lambda: datetime.now(UTC))
        self._memory: dict[date, float] = {}

    def _day(self) -> date:
        return self.clock().date()

    @staticmethod
    def _store(request: ModelRequest[Any]) -> BaseStore | None:
        runtime = request.runtime
        return getattr(runtime, "store", None) if runtime is not None else None

    def _check(self, spent: float) -> None:
        if spent >= self.daily_budget_usd:
            raise BudgetExceeded(f"LLM budget for {self._day()} is spent ({spent:.4f} of {self.daily_budget_usd} USD)")

    def spent(self, store: BaseStore | None) -> float:
        day = self._day()
        if store is None:
            return self._memory.get(day, 0.0)
        item = store.get(SPEND_NAMESPACE, day.isoformat())
        return float(item.value.get("usd", 0.0)) if item else 0.0

    async def aspent(self, store: BaseStore | None) -> float:
        day = self._day()
        if store is None:
            return self._memory.get(day, 0.0)
        item = await store.aget(SPEND_NAMESPACE, day.isoformat())
        return float(item.value.get("usd", 0.0)) if item else 0.0

    def _add(self, store: BaseStore | None, usd: float) -> None:
        day = self._day()
        if store is None:
            self._memory[day] = self._memory.get(day, 0.0) + usd
            return
        store.put(SPEND_NAMESPACE, day.isoformat(), {"usd": self.spent(store) + usd}, index=False)

    async def _aadd(self, store: BaseStore | None, usd: float) -> None:
        day = self._day()
        if store is None:
            self._memory[day] = self._memory.get(day, 0.0) + usd
            return
        await store.aput(SPEND_NAMESPACE, day.isoformat(), {"usd": await self.aspent(store) + usd}, index=False)

    def wrap_model_call(
        self,
        request: ModelRequest[Any],
        handler: Callable[[ModelRequest[Any]], ModelResponse[Any]],
    ) -> ModelResponse[Any]:
        store = self._store(request)
        self._check(self.spent(store))
        response = handler(request)
        self._add(store, response_cost(response, model_name_of(request.model), self.prices))
        return response

    async def awrap_model_call(
        self,
        request: ModelRequest[Any],
        handler: Callable[[ModelRequest[Any]], Awaitable[ModelResponse[Any]]],
    ) -> ModelResponse[Any]:
        store = self._store(request)
        self._check(await self.aspent(store))
        response = await handler(request)
        await self._aadd(store, response_cost(response, model_name_of(request.model), self.prices))
        return response


def standard_middleware(
    *,
    budget: BudgetMiddleware | None,
    fallback: AgentMiddleware[Any, Any] | None = None,
    model_call_limit: int = 12,
    tool_call_limit: int = 30,
) -> list[AgentMiddleware[Any, Any]]:
    """The stack every agent gets: budget (outermost), call limits, retries, then the role's fallback models."""
    stack: list[AgentMiddleware[Any, Any]] = []
    if budget is not None:
        stack.append(budget)
    stack += [
        ModelCallLimitMiddleware(run_limit=model_call_limit, exit_behavior="error"),
        ToolCallLimitMiddleware(run_limit=tool_call_limit),
        ModelRetryMiddleware(max_retries=2),
        ToolRetryMiddleware(max_retries=2),
    ]
    if fallback is not None:
        stack.append(fallback)
    return stack


_BUDGETS: dict[str, BudgetMiddleware] = {}


def role_middleware(
    role: str, *, model_call_limit: int = 12, tool_call_limit: int = 30
) -> list[AgentMiddleware[Any, Any]]:
    """The standard stack for a role of the active profile; one budget instance per profile is shared by all agents."""
    from shop_agent import llm
    from shop_agent.config import get_settings

    settings = get_settings()
    profile = llm.get_profile(None, settings)
    budget = _BUDGETS.get(profile.name)
    if budget is None:
        budget = _BUDGETS[profile.name] = BudgetMiddleware(settings.llm_daily_budget_usd, profile.price)
    return standard_middleware(
        budget=budget,
        fallback=llm.fallback_middleware(role),
        model_call_limit=model_call_limit,
        tool_call_limit=tool_call_limit,
    )
