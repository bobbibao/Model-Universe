"""Approval for the copilot's write tools (docs/ARCHITECTURE.md section 8, ADR-0011).

A write tool that changes the shop pauses for a person (`HumanInTheLoopMiddleware`: approve, edit or reject) unless
the web would run that exact request without a grant: its capabilities are in `auto_low` and it is inside the web's
low-risk caps. That is `domain.growth.policies.evaluate` without a grant, the web's own rule, so the copilot's tiers
and settings are the loop's. Protective tools (end a promotion, pause an ad, revert) never pause.

The check needs a fresh snapshot, which the synchronous `when` predicate cannot read, so `ApprovalMiddleware` runs it
after each model call and records the call ids that need no person; `when` reads them. Its state also carries the
grants: the web gateway resumes an interrupt with
`Command(resume={"decisions": [...]}, update={"approval_grants": {tool_call_id: grant}})`, and each write tool
forwards its own call's grant (`tools/writes.py`).
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Sequence
from contextlib import suppress
from typing import Annotated, Any, NotRequired

from langchain.agents.middleware import AgentMiddleware, AgentState, InterruptOnConfig, ModelRequest, ModelResponse
from langchain.agents.middleware.types import ExtendedModelResponse, PrivateStateAttr
from langchain_core.messages import AIMessage, ToolCall
from langgraph.config import get_config
from langgraph.prebuilt.tool_node import ToolCallRequest
from langgraph.runtime import Runtime
from langgraph.types import Command
from pydantic import BaseModel

from shop_agent.tools.deps import get_deps
from shop_agent.tools.writes import WRITE_TOOLS, WRITES, describe_call, refusal, thread_id_of, write_request

NEEDS_NO_PERSON_KEY = "approval_not_needed"
GATED_TOOLS = tuple(name for name, entry in WRITES.items() if not entry.protective)
_TOOLS = {tool.name: tool for tool in WRITE_TOOLS}


def _merge(left: dict[str, str] | None, right: dict[str, str] | None) -> dict[str, str]:
    return {**(left or {}), **(right or {})}


class ApprovalState(AgentState[Any]):
    approval_grants: NotRequired[Annotated[dict[str, str], _merge]]  # tool call id -> grant (JWT)
    approval_not_needed: NotRequired[Annotated[list[str], PrivateStateAttr]]  # this turn's call ids


class ApprovalMiddleware(AgentMiddleware[ApprovalState, Any]):
    """Decides, after each model call, which write calls need no person (see the module docstring)."""

    state_schema = ApprovalState

    async def awrap_model_call(
        self,
        request: ModelRequest[Any],
        handler: Callable[[ModelRequest[Any]], Awaitable[ModelResponse[Any]]],
    ) -> ExtendedModelResponse[Any]:
        response = await handler(request)
        # Preflight, the approval card and execution must see the same tool-validated arguments.
        # Use the installed tool's public schema; never normalize money with a separate parser.
        for message in response.result:
            if not isinstance(message, AIMessage):
                continue
            for call in message.tool_calls:
                if call["name"] not in GATED_TOOLS:
                    continue
                schema = _TOOLS[call["name"]].tool_call_schema
                if isinstance(schema, type) and issubclass(schema, BaseModel):
                    # Invalid arguments remain gated; tool validation still refuses execution.
                    with suppress(ValueError):
                        call["args"] = schema.model_validate(call["args"]).model_dump(exclude_unset=True)
        calls = [
            call
            for message in response.result
            if isinstance(message, AIMessage)
            for call in message.tool_calls
            if call["name"] in GATED_TOOLS
        ]
        not_needed = await self._not_needed(calls, request.runtime) if calls else []
        return ExtendedModelResponse(response, Command(update={NEEDS_NO_PERSON_KEY: not_needed}))

    @staticmethod
    async def _not_needed(calls: Sequence[ToolCall], runtime: Runtime[Any] | None) -> list[str]:
        deps = await get_deps(runtime)
        snapshot = await deps.reader.growth_snapshot(deps.clock())
        thread_id = thread_id_of(get_config())
        ids: list[str] = []
        for call in calls:
            call_id = str(call.get("id") or "")
            try:
                spec = write_request(call["name"], call["args"], snapshot, thread_id=thread_id, call_id=call_id)
            except ValueError:
                # Tool argument validation may coerce a rejected raw value (e.g. "500000" -> 500000)
                # into a valid write. Failed preflight must therefore never auto-approve the call.
                continue
            refused = refusal(spec, snapshot, deps.limits, has_grant=True) is not None
            if refused or refusal(spec, snapshot, deps.limits, has_grant=False) is None:
                ids.append(call_id)  # refused anyway, or the web runs it without a grant (auto_low, low-risk caps)
        return ids


def _needs_person(request: ToolCallRequest) -> bool:
    return request.tool_call.get("id") not in (request.state.get(NEEDS_NO_PERSON_KEY) or ())


def _description(tool_call: ToolCall, state: Any, runtime: Any) -> str:
    return describe_call(tool_call["name"], tool_call["args"])


def approval_policy() -> dict[str, bool | InterruptOnConfig]:
    """`interrupt_on` for the copilot: every non-protective write tool; a person approves, edits or rejects."""
    return {
        name: InterruptOnConfig(
            allowed_decisions=["approve", "edit", "reject"], description=_description, when=_needs_person
        )
        for name in GATED_TOOLS
    }
