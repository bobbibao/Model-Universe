"""Run one tool call the way an agent does: through ToolNode in a graph, with ShopDeps as the run context."""

from __future__ import annotations

from typing import Any

from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.tools import BaseTool
from langgraph.graph import START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode
from langgraph.store.base import BaseStore

from shop_agent.tools.deps import ShopDeps


class ToolState(MessagesState, total=False):
    approval_grants: dict[str, str]  # what the gateway's resume command writes (agents/approval.py)


async def call_tool(
    tool: BaseTool,
    args: dict[str, Any],
    deps: ShopDeps | None,
    *,
    store: BaseStore | None = None,
    thread_id: str = "t1",
    call_id: str = "call-1",
    grants: dict[str, str] | None = None,
) -> str:
    builder = StateGraph(ToolState, context_schema=ShopDeps)
    builder.add_node("tools", ToolNode([tool]))
    builder.add_edge(START, "tools")
    graph = builder.compile(store=store)
    call = AIMessage("", tool_calls=[{"name": tool.name, "args": args, "id": call_id, "type": "tool_call"}])
    state: ToolState = {"messages": [call], "approval_grants": grants or {}}
    result = await graph.ainvoke(state, {"configurable": {"thread_id": thread_id}}, context=deps)
    message = result["messages"][-1]
    assert isinstance(message, ToolMessage)
    return str(message.content)
