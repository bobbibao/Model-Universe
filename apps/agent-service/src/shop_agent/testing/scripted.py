"""A deterministic chat model for tests, CI and the e2e stack (the `scripted` LLM profile).

Scripts are YAML files mapping a *script key* to a list of steps:

    improvement.investigate.dead_stock:
      - tool_calls: [{name: find_dead_stock, args: {}}]
      - call: shop_agent.testing.script_fns:propose_from_opportunity

The key comes from the `script_key` metadata that the calling node sets on its model/agent call (it is inherited by
the chat-model run); calls without one use `default`. The step index is the number of AI messages already in the
conversation, so a re-run of the same conversation replays the same answers. A step is one of:

- `content: <text>`: a plain answer;
- `tool_calls: [{name, args}]`: tool calls (each name must be one of the bound tools);
- `structured: <mapping>`: the parsed result of `with_structured_output`;
- `call: <module>:<function>`: `function(messages=..., metadata=..., tools=...)` returns an `AIMessage` or a step
  mapping, so a script can use data only known at run time (seeded SKUs, refs).
"""

from __future__ import annotations

import importlib
import json
import os
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import Any, cast

import yaml
from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models import BaseChatModel, LanguageModelInput
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.runnables import Runnable, RunnableConfig, RunnableLambda
from langchain_core.tools import BaseTool
from langchain_core.utils.function_calling import convert_to_openai_tool
from pydantic import BaseModel, Field

DEFAULT_SCRIPTS_DIR = Path(__file__).resolve().parent / "scripts"
SCRIPTS_DIR_ENV = "SCRIPTED_LLM_DIR"
DEFAULT_KEY = "default"


class ScriptError(RuntimeError):
    pass


def load_scripts(directories: Sequence[Path]) -> dict[str, list[dict[str, Any]]]:
    scripts: dict[str, list[dict[str, Any]]] = {}
    for directory in directories:
        for path in sorted(directory.glob("*.yaml")):
            data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            for key, steps in data.items():
                if not isinstance(steps, list):
                    raise ScriptError(f"{path}: script {key!r} must be a list of steps")
                scripts[str(key)] = steps
    return scripts


def _resolve_callable(ref: str) -> Callable[..., Any]:
    module_name, _, attr = ref.partition(":")
    function: object = getattr(importlib.import_module(module_name), attr, None)
    if not callable(function):
        raise ScriptError(f"script step `call: {ref}` does not name a callable")
    return cast(Callable[..., Any], function)


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


class ScriptedChatModel(BaseChatModel):
    scripts: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)

    @classmethod
    def from_directories(cls, extra: Sequence[Path] = ()) -> ScriptedChatModel:
        directories = [DEFAULT_SCRIPTS_DIR, *extra]
        env = os.environ.get(SCRIPTS_DIR_ENV)
        if env:
            directories += [Path(p) for p in env.split(os.pathsep) if p]
        return cls(scripts=load_scripts(directories))

    @property
    def _llm_type(self) -> str:
        return "scripted"

    @property
    def model(self) -> str:
        """The name used for budget prices (profile `scripted`)."""
        return "scripted"

    # ------------------------------------------------------------------------------------------------ generation

    def _step_for(self, messages: list[BaseMessage], metadata: Mapping[str, Any]) -> tuple[str, int, dict[str, Any]]:
        key = str(metadata.get("script_key") or DEFAULT_KEY)
        if key not in self.scripts:
            raise ScriptError(f"no scripted answers for script key {key!r}")
        index = sum(1 for m in messages if isinstance(m, AIMessage))
        steps = self.scripts[key]
        if index >= len(steps):
            raise ScriptError(f"script {key!r} has {len(steps)} steps; step {index + 1} was requested")
        return key, index, steps[index]

    def _message_for(
        self,
        key: str,
        index: int,
        step: Mapping[str, Any],
        messages: list[BaseMessage],
        metadata: Mapping[str, Any],
        tools: list[dict[str, Any]] | None,
    ) -> AIMessage:
        if "call" in step:
            produced = _resolve_callable(str(step["call"]))(messages=messages, metadata=metadata, tools=tools)
            if isinstance(produced, AIMessage):
                return produced
            return self._message_for(key, index, produced, messages, metadata, tools)
        if "tool_calls" in step:
            bound = {t["function"]["name"] for t in tools or []}
            calls = []
            for n, call in enumerate(step["tool_calls"]):
                name = str(call["name"])
                if tools is not None and name not in bound:
                    raise ScriptError(f"script {key!r} step {index + 1} calls {name!r}, which is not bound")
                calls.append({"name": name, "args": dict(call.get("args") or {}), "id": f"call-{key}-{index}-{n}"})
            return AIMessage(content=str(step.get("content", "")), tool_calls=calls)
        if "structured" in step:
            return AIMessage(content=json.dumps(step["structured"], ensure_ascii=False))
        if "content" in step:
            return AIMessage(content=str(step["content"]))
        raise ScriptError(f"script {key!r} step {index + 1} has no content, tool_calls, structured or call")

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        metadata: Mapping[str, Any] = (run_manager.metadata if run_manager else None) or {}
        key, index, step = self._step_for(messages, metadata)
        message = self._message_for(key, index, step, messages, metadata, kwargs.get("tools"))
        input_tokens = _estimate_tokens("".join(str(m.content) for m in messages))
        output_tokens = _estimate_tokens(str(message.content) + json.dumps(message.tool_calls, default=str))
        message.usage_metadata = {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
        }
        message.response_metadata = {"model_name": "scripted", "script_key": key, "script_step": index + 1}
        return ChatResult(generations=[ChatGeneration(message=message)])

    # ------------------------------------------------------------------------------------------------ tools

    def bind_tools(
        self,
        tools: Sequence[dict[str, Any] | type | Callable[..., Any] | BaseTool],
        *,
        tool_choice: str | None = None,  # accepted and ignored, like Ollama
        **kwargs: Any,
    ) -> Runnable[LanguageModelInput, AIMessage]:
        return self.bind(tools=[convert_to_openai_tool(tool) for tool in tools], **kwargs)

    def with_structured_output(
        self,
        schema: dict[str, Any] | type,
        *,
        include_raw: bool = False,
        **kwargs: Any,
    ) -> Runnable[LanguageModelInput, Any]:
        def parse(value: LanguageModelInput, config: RunnableConfig) -> Any:
            raw = self.invoke(value, config)
            data = raw.tool_calls[0]["args"] if raw.tool_calls else json.loads(str(raw.content))
            parsed = schema.model_validate(data) if isinstance(schema, type) and issubclass(schema, BaseModel) else data
            return {"raw": raw, "parsed": parsed, "parsing_error": None} if include_raw else parsed

        return RunnableLambda(parse)
