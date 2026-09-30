"""A scripted LlmClient: no network, no model. Each reply is a dict (validated against the requested schema), an
LlmError to raise, or a callable taking (schema, user) and returning one of those."""
from __future__ import annotations

from typing import Any

from ci_agent.infrastructure.reasoning.llm_clients import LlmReply


class FakeLlmClient:
    provider, model = "fake", "fake-model"

    def __init__(self, *replies: Any, cost_usd: float = 0.0) -> None:
        self.replies, self.cost, self.calls = list(replies), cost_usd, []

    def complete(self, system: str, user: str, schema: type, max_tokens: int) -> LlmReply:
        self.calls.append({"system": system, "user": user, "schema": schema, "max_tokens": max_tokens})
        reply = self.replies.pop(0) if len(self.replies) > 1 else self.replies[0]
        if callable(reply) and not isinstance(reply, type):
            reply = reply(schema, user)
        if isinstance(reply, Exception):
            raise reply
        return LlmReply(schema.model_validate(reply), 120, 40)

    def cost_usd(self, reply: LlmReply) -> float:
        return self.cost

    def check(self) -> None:
        pass
