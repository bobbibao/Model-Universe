"""Functions that `call:` script steps use to build answers from data only known at run time."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, ToolMessage


def last_tool_output(messages: Sequence[BaseMessage]) -> str:
    for message in reversed(messages):
        if isinstance(message, ToolMessage):
            return str(message.content)
    return ""


def echo_tool_result(
    *, messages: Sequence[BaseMessage], metadata: Mapping[str, Any], tools: list[dict[str, Any]] | None
) -> AIMessage:
    """Answer with the last tool result, verbatim (so every number in the answer comes from a tool)."""
    return AIMessage(content=last_tool_output(messages))
