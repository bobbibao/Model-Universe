"""Stateless scenario selection. YAML changes reload automatically; conversations carry their own progress."""

from __future__ import annotations

import json
import re
import threading
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import yaml
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from pydantic import BaseModel, ConfigDict, Field, model_validator

from shop_agent.testing.scripted import DEFAULT_SCRIPTS_DIR, ScriptedChatModel, ScriptError, _resolve_callable

SCENARIOS_DIR = Path(__file__).parent / "scenarios"


def normalize(text: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", text.lower().replace("đ", "d")) if not unicodedata.combining(c)
    )


class SimulatorError(ValueError):
    def __init__(self, message: str, status: int = 422) -> None:
        super().__init__(message)
        self.status = status


class Scenario(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    scope: Literal["customer", "marketing", "copilot", "any"] = "any"
    match: list[str] = Field(default_factory=list)
    script_key: str | None = None
    steps: list[dict[str, Any]] = Field(min_length=1)
    repeat_last: bool = False
    examples: list[str] = Field(default_factory=list)
    covers: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def valid_steps(self) -> Scenario:
        for pattern in self.match:
            re.compile(pattern)
        for step in self.steps:
            if len(set(step) & {"content", "structured", "tool_calls", "call", "error"}) != 1:
                raise ValueError("Each step needs exactly one of content, structured, tool_calls, call, error")
            if not 0 <= step.get("delay_ms", 0) <= 30000:
                raise ValueError("delay_ms must be between 0 and 30000")
            if "error" in step and not 400 <= step["error"].get("status", 503) <= 599:
                raise ValueError("error.status must be an HTTP error (400-599)")
        return self


@dataclass(frozen=True)
class Reply:
    message: AIMessage
    scenario: str
    step: int
    delay_ms: int = 0


def decode_messages(raw: Any) -> list[BaseMessage]:
    if not isinstance(raw, list) or not raw or len(raw) > 300:
        raise SimulatorError("messages must contain 1-300 chat messages", 400)
    messages: list[BaseMessage] = []
    for item in raw:
        if not isinstance(item, dict):
            raise SimulatorError("Each message must be an object", 400)
        content = item.get("content") or ""
        if not isinstance(content, (str, list)):
            raise SimulatorError("Message content must be text or content blocks", 400)
        role = item.get("role")
        if role in ("system", "developer"):
            messages.append(SystemMessage(content=content))
        elif role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "tool":
            messages.append(ToolMessage(content=content, tool_call_id=str(item.get("tool_call_id", ""))))
        elif role == "assistant":
            calls = []
            for call in item.get("tool_calls") or []:
                try:
                    args = json.loads(call["function"]["arguments"])
                    if not isinstance(args, dict):
                        raise ValueError("tool arguments must be an object")
                    calls.append({"name": call["function"]["name"], "args": args, "id": call["id"]})
                except (KeyError, TypeError, ValueError) as exc:
                    raise SimulatorError("Invalid assistant tool_calls", 400) from exc
            messages.append(AIMessage(content=content, tool_calls=calls))
        else:
            raise SimulatorError(f"Unsupported message role: {role}", 400)
    return messages


def last_user(messages: list[BaseMessage]) -> str:
    return next((str(m.content) for m in reversed(messages) if isinstance(m, HumanMessage)), "")


class Engine:
    def __init__(self, directory: Path | None = None, *, strict: bool = False) -> None:
        self.directory = directory
        self.strict = strict
        self._lock = threading.RLock()
        self._signature: tuple[tuple[str, int, int], ...] = ()
        self.scenarios: list[Scenario] = []
        self.scripted = ScriptedChatModel.from_directories()
        self.reload()

    def reload(self) -> None:
        with self._lock:
            files = sorted(SCENARIOS_DIR.glob("*.yaml"))
            if self.directory:
                if not self.directory.is_dir():
                    raise SimulatorError(f"Scenario directory does not exist: {self.directory}")
                files = sorted(self.directory.glob("*.yaml")) + files
            files += sorted(DEFAULT_SCRIPTS_DIR.glob("*.yaml"))
            signature = tuple((str(p), p.stat().st_mtime_ns, p.stat().st_size) for p in files)
            if signature == self._signature:
                return
            scenarios: list[Scenario] = []
            seen: set[str] = set()
            for path in files:
                data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
                for raw in data.get("scenarios", []):
                    scenario = Scenario.model_validate(raw)
                    if scenario.id not in seen:  # extra directory comes first, may replace built-ins
                        scenarios.append(scenario)
                        seen.add(scenario.id)
            self.scenarios = scenarios
            self.scripted = ScriptedChatModel.from_directories()
            self._signature = signature

    def inventory(self) -> list[dict[str, Any]]:
        self.reload()
        return [s.model_dump(exclude={"steps"}) for s in self.scenarios] + [
            {"id": key, "scope": "scripted", "steps": len(steps)}
            for key, steps in sorted(self.scripted.scripts.items())
        ]

    def respond(self, body: Mapping[str, Any]) -> Reply:
        self.reload()
        messages = decode_messages(body.get("messages"))
        tools = body.get("tools") or []
        if not isinstance(tools, list) or any(
            not isinstance(t, dict) or not isinstance(t.get("function"), dict) or not t["function"].get("name")
            for t in tools
        ):
            raise SimulatorError("tools must be a list of function definitions", 400)
        metadata = dict(body.get("simulator") or {})
        forced = metadata.get("scenario")
        key = metadata.get("script_key")
        text = last_user(messages)
        names = {t["function"]["name"] for t in tools}
        schema = (body.get("response_format") or {}).get("json_schema", {}).get("name")
        scope = (
            "customer"
            if "Decision" in names or schema == "Decision"
            else ("marketing" if "MarketingCopy" in names or schema == "MarketingCopy" else "copilot")
        )
        try:
            request = json.loads(text)
        except ValueError:
            request = None
        if scope == "customer" and isinstance(request, dict):
            text = str(request.get("message", ""))
        normalized = normalize(text)
        scenario = next(
            (
                s
                for s in self.scenarios
                if (
                    s.id == forced
                    if forced
                    else (
                        (s.script_key == key and key is not None)
                        or (s.scope in (scope, "any") and s.match and any(re.search(p, normalized) for p in s.match))
                    )
                )
            ),
            None,
        )
        # Explicit operational/test script keys keep the existing replay semantics, including subagents.
        if not forced and key in self.scripted.scripts and not (scenario and scenario.script_key == key):
            script_metadata = {**metadata, "script_key": key}
            try:
                script_key, index, step = self.scripted._step_for(messages, script_metadata)
            except ScriptError as exc:
                raise SimulatorError(str(exc)) from exc
            return self._reply(script_key, index, step, messages, script_metadata, tools)
        if scenario:
            last_human = max((i for i, m in enumerate(messages) if isinstance(m, HumanMessage)), default=-1)
            index = sum(isinstance(m, AIMessage) for m in messages[last_human + 1 :])
            if scenario.repeat_last:
                index = min(index, len(scenario.steps) - 1)
            if index >= len(scenario.steps):
                raise SimulatorError(f"Scenario {scenario.id!r} exhausted at step {index + 1}")
            metadata.update({"intent": scenario.id, "scope": scope})
            return self._reply(scenario.id, index, scenario.steps[index], messages, metadata, tools)
        if forced or (key and key not in ("customer-assistant", "admin-marketing-copy", "default")):
            raise SimulatorError(f"Unknown simulator scenario/script: {forced or key}")
        if self.strict:
            raise SimulatorError("No matching scenario; add a YAML scenario or choose simulator.scenario explicitly")
        if scope == "customer":
            return self._reply(
                "customer.fallback",
                0,
                {"call": "shop_agent.testing.simulator.customer:respond"},
                messages,
                {"intent": "customer.fallback"},
                tools,
            )
        return Reply(
            AIMessage(content="Mình chưa có kịch bản cho yêu cầu này. Hãy mô tả cụ thể hơn hoặc thêm kịch bản YAML."),
            "unmatched",
            1,
        )

    def _reply(
        self,
        key: str,
        index: int,
        step: dict[str, Any],
        messages: list[BaseMessage],
        metadata: Mapping[str, Any],
        tools: list[dict[str, Any]],
    ) -> Reply:
        if "error" in step:
            error = step["error"]
            raise SimulatorError(str(error.get("message", "Simulated failure")), int(error.get("status", 503)))
        try:
            effective = step
            produced = None
            if "call" in step:
                produced = _resolve_callable(str(step["call"]))(messages=messages, metadata=metadata, tools=tools)
                if not isinstance(produced, AIMessage):
                    effective = dict(produced)
            message = (
                produced
                if isinstance(produced, AIMessage)
                else self.scripted._message_for(key, index, effective, messages, metadata, tools)
            )
        except (ScriptError, KeyError, TypeError, ValueError) as exc:
            raise SimulatorError(f"Scenario {key!r}, step {index + 1}: {exc}") from exc
        # A scripted structured result must use the requested function on the actual wire.
        choice = metadata.get("tool_choice")
        if "structured" in effective and not message.tool_calls and message.content and tools:
            try:
                value = json.loads(str(message.content))
            except ValueError:
                value = None
            if isinstance(value, dict) and (len(tools) == 1 or choice):
                name = choice or tools[0]["function"]["name"]
                message = AIMessage(content="", tool_calls=[{"name": name, "args": value, "id": f"call-{key}-{index}"}])
        names = {t["function"]["name"] for t in tools}
        if any(c["name"] not in names for c in message.tool_calls):
            raise SimulatorError(f"Scenario {key!r} calls a tool that is not bound")
        if choice and any(c["name"] != choice for c in message.tool_calls):
            raise SimulatorError(f"Scenario {key!r} does not use the requested tool {choice!r}")
        return Reply(message, key, index + 1, int(step.get("delay_ms", 0)))
