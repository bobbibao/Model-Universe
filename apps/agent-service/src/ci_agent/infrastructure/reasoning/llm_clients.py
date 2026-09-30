"""LLM clients for the LLM reasoner: one small interface, two providers (ROADMAP T-01, docs/adr/0008).

A client sends one system + user message, asks for JSON matching a Pydantic schema (structured output) and
returns the validated object. It never gets tools: there is no parameter for them. Every failure is raised as
`LlmError` with a `kind`, so the reasoner can fall back to rules and log config errors apart from transient ones.

- `OllamaClient`: the native Ollama chat API (`format` = JSON schema), local, free, one GPU/CPU.
- `ClaudeClient`: the official `anthropic` SDK (`messages.parse` with the schema as `output_format`), no SDK
  retries (the reasoner falls back instead of stacking retries), effort `low`.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any, Protocol, TypeVar

from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# Error kinds. Transient ones pause LLM calls for a cool-down; "config" is logged at ERROR every time.
TIMEOUT, UNAVAILABLE, CONFIG, REFUSAL, INVALID_OUTPUT = "timeout", "unavailable", "config", "refusal", "invalid_output"
TRANSIENT = frozenset({TIMEOUT, UNAVAILABLE})


class LlmError(Exception):
    def __init__(self, kind: str, detail: str) -> None:
        super().__init__(f"{kind}: {detail}")
        self.kind, self.detail = kind, detail


@dataclass(frozen=True)
class LlmReply:
    output: BaseModel
    input_tokens: int
    output_tokens: int


class LlmClient(Protocol):
    provider: str
    model: str

    def complete(self, system: str, user: str, schema: type[T], max_tokens: int) -> LlmReply: ...

    def cost_usd(self, reply: LlmReply) -> float: ...

    def check(self) -> None:
        """Startup probe: log at ERROR what would make every call fail (unknown model, bad key)."""
        ...


def _parse(schema: type[T], text: str) -> T:
    try:
        return schema.model_validate_json(text)
    except ValidationError as exc:
        raise LlmError(INVALID_OUTPUT, f"output does not match the schema ({exc.error_count()} errors)") from exc


# ------------------------------------------------------------------------------------------------ Ollama

OLLAMA_KEEP_ALIVE = "30m"  # keep the model loaded between runs: loading it takes seconds
_CHARS_PER_TOKEN = 3.0  # conservative estimate (English with numbers is ~4): refuse early rather than truncate


class OllamaClient:
    provider = "ollama"

    def __init__(self, model: str, base_url: str, timeout_s: float, num_ctx: int, temperature: float,
                 client: Any | None = None) -> None:
        if client is None:
            import ollama

            client = ollama.Client(host=base_url, timeout=timeout_s)
        self.model, self._base_url, self._client = model, base_url, client
        self._num_ctx, self._temperature = num_ctx, temperature

    def complete(self, system: str, user: str, schema: type[T], max_tokens: int) -> LlmReply:
        # Ollama silently drops the start of a prompt that does not fit num_ctx: refuse instead.
        if (len(system) + len(user)) / _CHARS_PER_TOKEN + max_tokens > self._num_ctx:
            raise LlmError(INVALID_OUTPUT, f"prompt may not fit num_ctx={self._num_ctx}")
        response = self._request(lambda: self._client.chat(
            model=self.model, messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            format=schema.model_json_schema(), keep_alive=OLLAMA_KEEP_ALIVE,
            options={"temperature": self._temperature, "num_ctx": self._num_ctx, "num_predict": max_tokens}))
        prompt_tokens, output_tokens = response.prompt_eval_count or 0, response.eval_count or 0
        if prompt_tokens + max_tokens > self._num_ctx:
            raise LlmError(INVALID_OUTPUT, f"prompt used {prompt_tokens} of num_ctx={self._num_ctx} tokens")
        if response.done_reason == "length":
            raise LlmError(INVALID_OUTPUT, f"output cut at num_predict={max_tokens}")
        return LlmReply(_parse(schema, response.message.content or ""), prompt_tokens, output_tokens)

    def cost_usd(self, reply: LlmReply) -> float:
        return 0.0

    def check(self) -> None:
        try:
            self._request(lambda: self._client.show(self.model))
            # An empty chat loads the model, so the first real call does not pay the load time.
            self._request(lambda: self._client.chat(model=self.model, messages=[], keep_alive=OLLAMA_KEEP_ALIVE))
        except LlmError as exc:
            level = logging.ERROR if exc.kind == CONFIG else logging.WARNING
            logger.log(level, "LLM reasoner: Ollama model %r at %s is not usable (%s); the rule-based reasoner "
                       "answers until it is.", self.model, self._base_url, exc)
            return
        logger.info("LLM reasoner ready: ollama %s at %s (num_ctx=%s, temperature=%s)", self.model, self._base_url,
                    self._num_ctx, self._temperature)

    def _request(self, call: Any) -> Any:
        import httpx
        import ollama

        try:
            return call()
        except httpx.TimeoutException as exc:
            raise LlmError(TIMEOUT, f"no answer from Ollama within the timeout ({type(exc).__name__})") from exc
        except ConnectionError as exc:
            raise LlmError(UNAVAILABLE, f"Ollama is not reachable at {self._base_url}") from exc
        except httpx.HTTPError as exc:
            raise LlmError(UNAVAILABLE, f"{type(exc).__name__}: {exc}") from exc
        except ollama.ResponseError as exc:
            if 400 <= exc.status_code < 500:
                hint = f" (run `ollama pull {self.model}`)" if exc.status_code == 404 else ""
                raise LlmError(CONFIG, f"HTTP {exc.status_code}: {exc.error}{hint}") from exc
            raise LlmError(UNAVAILABLE, f"HTTP {exc.status_code}: {exc.error}") from exc


# ------------------------------------------------------------------------------------------------ Claude

# USD per million tokens (input, output), from the Anthropic model catalog; checked for T-01.
CLAUDE_PRICES: dict[str, tuple[float, float]] = {
    "claude-sonnet-5": (2.0, 10.0),
    "claude-opus-5-5": (4.0, 20.0),
    "claude-opus-5": (5.0, 25.0),
    "claude-haiku-4-5": (1.0, 5.0),
    "claude-sonnet-4-6": (3.0, 15.0),
    "claude-fable-5-1": (10.0, 50.0),
}
_UNKNOWN_MODEL_PRICE = (10.0, 50.0)  # the most expensive tier, so the daily budget errs on the safe side
CLAUDE_EFFORT = "low"  # short, structured answers; adaptive thinking stays on (the model default)
_OUTPUT_CONFIG: Any = {"effort": CLAUDE_EFFORT}  # the SDK's OutputConfigParam; typed loosely to keep the import lazy


def claude_price(model: str) -> tuple[float, float] | None:
    """The alias or a dated snapshot of it ("claude-haiku-4-5-20251001"); anything else is unknown."""
    return CLAUDE_PRICES.get(re.sub(r"-\d{8}$", "", model))


class ClaudeClient:
    provider = "claude"

    def __init__(self, model: str, api_key: str, timeout_s: float, client: Any | None = None) -> None:
        if client is None:
            import anthropic

            client = anthropic.Anthropic(api_key=api_key, timeout=timeout_s, max_retries=0)
        self.model, self._client = model, client
        self._price = claude_price(model) or _UNKNOWN_MODEL_PRICE

    def complete(self, system: str, user: str, schema: type[T], max_tokens: int) -> LlmReply:
        response = self._request(lambda: self._client.messages.parse(
            model=self.model, max_tokens=max_tokens, system=system,
            messages=[{"role": "user", "content": user}], output_format=schema,
            output_config=_OUTPUT_CONFIG))
        reply_tokens = (response.usage.input_tokens, response.usage.output_tokens)
        if response.stop_reason == "refusal":
            raise LlmError(REFUSAL, "the model declined the request")
        if response.stop_reason == "max_tokens":
            raise LlmError(INVALID_OUTPUT, f"output cut at max_tokens={max_tokens}")
        output = response.parsed_output
        if output is None:
            raise LlmError(INVALID_OUTPUT, "no structured output in the response")
        return LlmReply(output, *reply_tokens)

    def cost_usd(self, reply: LlmReply) -> float:
        price_in, price_out = self._price
        return (reply.input_tokens * price_in + reply.output_tokens * price_out) / 1_000_000

    def check(self) -> None:
        if claude_price(self.model) is None:
            logger.warning("LLM reasoner: no price known for %r; the daily budget counts it at $%s/$%s per million "
                           "tokens.", self.model, *_UNKNOWN_MODEL_PRICE)
        try:
            self._request(lambda: self._client.models.retrieve(self.model))  # free: checks the key and the model id
        except LlmError as exc:
            level = logging.ERROR if exc.kind == CONFIG else logging.WARNING
            logger.log(level, "LLM reasoner: Claude model %r is not usable (%s); the rule-based reasoner answers "
                       "until it is.", self.model, exc)
            return
        logger.info("LLM reasoner ready: claude %s (effort %s)", self.model, CLAUDE_EFFORT)

    def _request(self, call: Any) -> Any:
        import anthropic

        try:
            return call()
        except anthropic.APITimeoutError as exc:  # a subclass of APIConnectionError: check it first
            raise LlmError(TIMEOUT, "no answer from the Claude API within the timeout") from exc
        except anthropic.APIConnectionError as exc:
            raise LlmError(UNAVAILABLE, "the Claude API is not reachable") from exc
        except anthropic.RateLimitError as exc:
            raise LlmError(UNAVAILABLE, "rate limited (HTTP 429)") from exc
        except anthropic.APIStatusError as exc:
            if exc.status_code >= 500:
                raise LlmError(UNAVAILABLE, f"HTTP {exc.status_code}") from exc
            # 400 bad parameter, 401 bad key, 403 permission, 404 unknown model: fix the settings.
            raise LlmError(CONFIG, f"HTTP {exc.status_code}: {_api_message(exc)}") from exc
        except (ValidationError, ValueError) as exc:  # messages.parse validates the JSON against the schema
            raise LlmError(INVALID_OUTPUT, f"output does not match the schema ({type(exc).__name__})") from exc


def _api_message(exc: Any) -> str:
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict) and isinstance(error.get("message"), str):
            return error["message"][:200]
    return type(exc).__name__
