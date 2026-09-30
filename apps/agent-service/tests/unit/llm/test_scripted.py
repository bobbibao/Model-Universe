from __future__ import annotations

from typing import Any

import pytest
from langchain.agents import create_agent
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.tools import tool
from pydantic import BaseModel

from shop_agent.testing.scripted import ScriptedChatModel, ScriptError


@tool
def lookup(sku: str) -> str:
    """Look a SKU up."""
    return f"{sku}: 5"


def model(scripts: dict[str, list[dict[str, object]]]) -> ScriptedChatModel:
    return ScriptedChatModel(scripts=scripts)


def run(m: ScriptedChatModel, key: str, text: str = "hi") -> Any:
    agent = create_agent(m, tools=[lookup])
    return agent.invoke({"messages": [HumanMessage(text)]}, {"metadata": {"script_key": key}})


def test_tool_calls_then_answer_in_an_agent_loop() -> None:
    m = model({"k": [{"tool_calls": [{"name": "lookup", "args": {"sku": "A"}}]}, {"content": "A còn 5"}]})
    messages = run(m, "k")["messages"]
    assert [type(x).__name__ for x in messages] == ["HumanMessage", "AIMessage", "ToolMessage", "AIMessage"]
    assert messages[-1].content == "A còn 5"
    assert messages[1].usage_metadata["output_tokens"] > 0


def test_call_step_uses_run_time_data() -> None:
    m = model(
        {
            "k": [
                {"tool_calls": [{"name": "lookup", "args": {"sku": "B"}}]},
                {"call": "shop_agent.testing.script_fns:echo_tool_result"},
            ]
        }
    )
    assert run(m, "k")["messages"][-1].content == "B: 5"


def test_unknown_key_names_the_key() -> None:
    with pytest.raises(ScriptError, match="'missing'"):
        run(model({}), "missing")


def test_exhausted_script() -> None:
    m = model({"k": [{"tool_calls": [{"name": "lookup", "args": {"sku": "A"}}]}]})
    with pytest.raises(ScriptError, match="has 1 steps; step 2"):
        run(m, "k")


def test_unbound_tool_is_a_script_error() -> None:
    with pytest.raises(ScriptError, match="not bound"):
        run(model({"k": [{"tool_calls": [{"name": "nope", "args": {}}]}]}), "k")


def test_default_key_without_metadata() -> None:
    m = model({"default": [{"content": "ok"}]})
    reply = m.invoke([HumanMessage("x")])
    assert isinstance(reply, AIMessage) and reply.content == "ok"


class Answer(BaseModel):
    ok: bool


def test_structured_output() -> None:
    m = model({"default": [{"structured": {"ok": True}}]})
    assert m.with_structured_output(Answer).invoke("x") == Answer(ok=True)
    raw = m.with_structured_output(Answer, include_raw=True).invoke("x")
    assert raw["parsed"] == Answer(ok=True)
