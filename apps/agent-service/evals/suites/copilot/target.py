"""Copilot suite: one chat turn of the `assistant` graph on the demo FakeShop, stopped where a person would decide.

The output is the conversation, the tool calls waiting for approval (`pending`) and the writes the shop received
(`shop_writes`, which must stay empty: nobody approves anything here).
"""

from __future__ import annotations

from typing import Any

from langchain_core.messages import AIMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.store.memory import InMemoryStore

from evals.evaluators import CaseOutput
from evals.suites.loop.target import NOW, build_shop
from shop_agent.graphs import assistant
from shop_agent.tools.deps import ShopDeps


async def run_case(case: dict[str, Any], profile: str) -> CaseOutput:
    shop = build_shop(case)
    deps = ShopDeps(reader=shop, writer=shop, clock=lambda: NOW, model_profile=profile)
    graph = assistant.build(checkpointer=InMemorySaver(), store=InMemoryStore())
    config = {
        "configurable": {"thread_id": f"eval-{case['id']}"},
        "metadata": {"script_key": f"evals.copilot.{case['id']}"},
    }
    result = await graph.ainvoke({"messages": [{"role": "user", "content": case["ask"]}]}, config, context=deps)
    pending = [action for item in result.get("__interrupt__", []) for action in item.value.get("action_requests", [])]
    messages = list(result["messages"])
    final = next((m.text for m in reversed(messages) if isinstance(m, AIMessage) and m.text), "")
    structured = {"pending": pending, "shop_writes": [sent.endpoint for sent in shop.sent]}
    return CaseOutput(messages=messages, structured=structured, final_text=final)
