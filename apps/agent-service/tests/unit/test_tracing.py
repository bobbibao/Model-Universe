"""Tracing (ADR-0012): Langfuse's handler is attached only when its keys are set, every run of a traced graph reaches
it, and personal data is masked before a trace leaves the process. No test talks to Langfuse."""

from __future__ import annotations

from typing import Any, TypedDict

import pytest
from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.messages import HumanMessage
from langfuse import get_client
from langfuse.langchain import CallbackHandler
from langgraph.graph import END, START, StateGraph

from shop_agent import wiring
from shop_agent.config import Settings


class _State(TypedDict, total=False):
    text: str


def tiny_graph() -> Any:
    async def echo(state: _State) -> _State:
        return {"text": state.get("text", "")}

    builder: StateGraph[_State, Any, _State, _State] = StateGraph(_State)
    return builder.add_node("echo", echo).add_edge(START, "echo").add_edge("echo", END).compile()


class Recorder(BaseCallbackHandler):
    def __init__(self) -> None:
        self.tags: list[list[str]] = []

    def on_chain_start(self, serialized: Any, inputs: Any, *, tags: list[str] | None = None, **_: Any) -> None:
        self.tags.append(tags or [])


def test_no_keys_no_tracing(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(_env_file=None)
    assert wiring.tracing_handler(settings) is None
    monkeypatch.setattr(wiring, "get_settings", lambda: settings)
    graph = tiny_graph()
    assert wiring.traced(graph, "improvement") is graph


def test_keys_attach_langfuse_to_the_graph(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(
        _env_file=None,
        langfuse_public_key="pk-lf-test",
        langfuse_secret_key="sk-lf-test",
        langfuse_host="http://127.0.0.1:9",  # nothing listens: no trace leaves the test
    )
    monkeypatch.setattr(wiring, "get_settings", lambda: settings)
    try:
        traced = wiring.traced(tiny_graph(), "assistant")
        [handler] = traced.config["callbacks"]
        assert isinstance(handler, CallbackHandler)
        assert traced.config["tags"] == ["assistant"]
    finally:
        get_client(public_key="pk-lf-test").shutdown()


async def test_every_run_of_a_traced_graph_reaches_the_handler(monkeypatch: pytest.MonkeyPatch) -> None:
    recorder = Recorder()
    monkeypatch.setattr(wiring, "tracing_handler", lambda _settings: recorder)
    graph = wiring.traced(tiny_graph(), "improvement")
    assert await graph.ainvoke({"text": "hi"}) == {"text": "hi"}
    assert recorder.tags and "improvement" in recorder.tags[0]


def test_masking_removes_personal_data() -> None:
    data = {
        "messages": [HumanMessage("Gọi tôi 0912 345 678 hoặc an.nguyen@example.vn")],
        "reasons": ["size sai, liên hệ +84912345678", 3],
        "total_vnd": 1_200_000,
    }
    masked = wiring.mask_personal_data(data=data)
    text = str(masked)
    assert "0912 345 678" not in text and "84912345678" not in text and "an.nguyen@example.vn" not in text
    assert "[REDACTED_PHONE]" in text and "[REDACTED_EMAIL]" in text
    assert masked["reasons"][1] == 3 and masked["total_vnd"] == 1_200_000
    assert masked["messages"][0]["type"] == "human"
