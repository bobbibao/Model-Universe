"""The shop operations copilot (Phase 8).

Phase 0 stub: START -> END, so `langgraph.json` lists every graph from day one.
"""

from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph


class State(TypedDict, total=False):
    stage: str
    detail: dict[str, Any]


builder = StateGraph(State)
builder.add_edge(START, END)
graph = builder.compile()
