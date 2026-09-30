"""Run one tool call the way an agent does: through ToolNode in a graph, with ShopDeps as the run context."""

from __future__ import annotations

from typing import Any

from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.tools import BaseTool
from langgraph.graph import START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode
from langgraph.store.base import BaseStore

from shop_agent.tools.deps import ShopDeps


async def call_tool(
    tool: BaseTool,
    args: dict[str, Any],
    deps: ShopDeps | None,
    *,
    store: BaseStore | None = None,
    thread_id: str = "t1",
    call_id: str = "call-1",
) -> str:
    builder = StateGraph(MessagesState, context_schema=ShopDeps)
    builder.add_node("tools", ToolNode([tool]))
    builder.add_edge(START, "tools")
    graph = builder.compile(store=store)
    call = AIMessage("", tool_calls=[{"name": tool.name, "args": args, "id": call_id, "type": "tool_call"}])
    result = await graph.ainvoke({"messages": [call]}, {"configurable": {"thread_id": thread_id}}, context=deps)
    message = result["messages"][-1]
    assert isinstance(message, ToolMessage)
    return str(message.content)
