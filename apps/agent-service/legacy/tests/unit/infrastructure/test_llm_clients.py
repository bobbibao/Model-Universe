"""Ollama and Claude clients (T-01) against fake SDK objects: what is sent, and how each failure is classified."""
import logging
from types import SimpleNamespace

import anthropic
import httpx
import httpx2
import ollama
import pytest

from ci_agent.bootstrap.container import build_reasoner
from ci_agent.config.settings import Settings
from ci_agent.infrastructure.reasoning.llm_clients import (
    CONFIG,
    INVALID_OUTPUT,
    REFUSAL,
    TIMEOUT,
    UNAVAILABLE,
    ClaudeClient,
    LlmError,
    LlmReply,
    OllamaClient,
    claude_price,
)
from ci_agent.infrastructure.reasoning.llm_reasoner import LlmReasoner
from ci_agent.infrastructure.reasoning.llm_schemas import QuestionOut
from ci_agent.infrastructure.reasoning.rule_based import RuleBasedReasoner

ANSWER = '{"prompt": "Seventeen jackets do not sell. Which option should we take?"}'


# Ollama -------------------------------------------------------------------------------------------------------

class FakeOllama:
    def __init__(self, result=None, error=None):
        self.result, self.error, self.calls = result, error, []

    def chat(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return self.result

    def show(self, model):
        if self.error:
            raise self.error


def _ollama_response(content=ANSWER, done_reason="stop", prompt_tokens=400, output_tokens=30):
    return SimpleNamespace(message=SimpleNamespace(content=content), done_reason=done_reason,
                           prompt_eval_count=prompt_tokens, eval_count=output_tokens)


def _ollama(fake) -> OllamaClient:
    return OllamaClient("qwen2.5:3b", "http://localhost:11434", 90, 8192, 0.1, client=fake)


def test_ollama_sends_the_schema_and_explicit_limits_and_no_tools():
    fake = FakeOllama(_ollama_response())
    reply = _ollama(fake).complete("system", "<facts>x</facts>", QuestionOut, 220)
    assert reply == LlmReply(QuestionOut(prompt="Seventeen jackets do not sell. Which option should we take?"), 400, 30)
    call = fake.calls[0]
    assert call["format"] == QuestionOut.model_json_schema()
    assert call["options"] == {"temperature": 0.1, "num_ctx": 8192, "num_predict": 220}
    assert call["messages"] == [{"role": "system", "content": "system"}, {"role": "user", "content": "<facts>x</facts>"}]
    assert "tools" not in call and _ollama(fake).cost_usd(reply) == 0.0


@pytest.mark.parametrize("response,detail", [
    (_ollama_response(done_reason="length"), "output cut at num_predict=220"),
    (_ollama_response(prompt_tokens=8000), "prompt used 8000 of num_ctx=8192 tokens"),
    (_ollama_response(content='{"prompt": "too short"}'), "does not match the schema"),
    (_ollama_response(content="not json"), "does not match the schema"),
])
def test_ollama_rejects_truncated_or_invalid_output(response, detail):
    with pytest.raises(LlmError) as error:
        _ollama(FakeOllama(response)).complete("s", "u", QuestionOut, 220)
    assert error.value.kind == INVALID_OUTPUT and detail in error.value.detail


def test_ollama_refuses_a_prompt_that_may_not_fit_before_calling():
    fake = FakeOllama(_ollama_response())
    with pytest.raises(LlmError, match="may not fit num_ctx"):
        _ollama(fake).complete("s", "x" * 30_000, QuestionOut, 220)
    assert fake.calls == []


@pytest.mark.parametrize("error,kind,detail", [
    (httpx.ReadTimeout("slow"), TIMEOUT, "within the timeout"),
    (ConnectionError("refused"), UNAVAILABLE, "not reachable"),
    (ollama.ResponseError("model 'qwen2.5:3b' not found", 404), CONFIG, "run `ollama pull qwen2.5:3b`"),
    (ollama.ResponseError("invalid option", 400), CONFIG, "HTTP 400"),
    (ollama.ResponseError("out of memory", 500), UNAVAILABLE, "HTTP 500"),
])
def test_ollama_failures_are_classified(error, kind, detail):
    with pytest.raises(LlmError) as raised:
        _ollama(FakeOllama(error=error)).complete("s", "u", QuestionOut, 220)
    assert raised.value.kind == kind and detail in raised.value.detail


def test_ollama_startup_check_logs_a_missing_model_at_error(caplog):
    with caplog.at_level(logging.INFO):
        _ollama(FakeOllama(error=ollama.ResponseError("model not found", 404))).check()
    assert caplog.records[-1].levelname == "ERROR" and "ollama pull" in caplog.text


# Claude -------------------------------------------------------------------------------------------------------

class FakeMessages:
    def __init__(self, result=None, error=None):
        self.result, self.error, self.calls = result, error, []

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return self.result


def _claude_response(stop_reason="end_turn", parsed=None):
    return SimpleNamespace(stop_reason=stop_reason, parsed_output=parsed,
                           usage=SimpleNamespace(input_tokens=1_000_000, output_tokens=100_000))


def _claude(messages) -> ClaudeClient:
    return ClaudeClient("claude-sonnet-5", "test-key", 30, client=SimpleNamespace(messages=messages))


def test_claude_uses_structured_output_low_effort_and_no_tools():
    output = QuestionOut(prompt="Seventeen jackets do not sell. Which option should we take?")
    messages = FakeMessages(_claude_response(parsed=output))
    client = _claude(messages)
    reply = client.complete("system", "<facts>x</facts>", QuestionOut, 2048)
    assert reply.output == output and client.cost_usd(reply) == pytest.approx(2.0 + 1.0)  # $2 + $10 per MTok
    call = messages.calls[0]
    assert call["output_format"] is QuestionOut and call["output_config"] == {"effort": "low"}
    assert call["system"] == "system" and call["max_tokens"] == 2048
    assert not {"tools", "tool_choice", "temperature"} & set(call)


@pytest.mark.parametrize("response,kind", [
    (_claude_response(stop_reason="refusal"), REFUSAL),
    (_claude_response(stop_reason="max_tokens"), INVALID_OUTPUT),
    (_claude_response(parsed=None), INVALID_OUTPUT),
])
def test_claude_refusals_and_cut_output(response, kind):
    with pytest.raises(LlmError) as raised:
        _claude(FakeMessages(response)).complete("s", "u", QuestionOut, 2048)
    assert raised.value.kind == kind


def _status_error(cls, status):
    response = httpx2.Response(status, request=httpx2.Request("POST", "https://api.anthropic.com/v1/messages"))
    return cls("error", response=response, body={"error": {"message": f"status {status}"}})


REQUEST = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")


@pytest.mark.parametrize("error,kind", [
    (anthropic.APITimeoutError(REQUEST), TIMEOUT),
    (anthropic.APIConnectionError(request=REQUEST), UNAVAILABLE),
    (_status_error(anthropic.RateLimitError, 429), UNAVAILABLE),
    (_status_error(anthropic.InternalServerError, 500), UNAVAILABLE),
    (_status_error(anthropic.AuthenticationError, 401), CONFIG),
    (_status_error(anthropic.NotFoundError, 404), CONFIG),
    (_status_error(anthropic.BadRequestError, 400), CONFIG),
])
def test_claude_failures_are_classified(error, kind):
    with pytest.raises(LlmError) as raised:
        _claude(FakeMessages(error=error)).complete("s", "u", QuestionOut, 2048)
    assert raised.value.kind == kind


def test_claude_prices_by_model_id():
    assert claude_price("claude-sonnet-5") == (2.0, 10.0)
    assert claude_price("claude-opus-5-5") == (4.0, 20.0) and claude_price("claude-opus-5") == (5.0, 25.0)
    assert claude_price("claude-haiku-4-5-20251001") == (1.0, 5.0)
    assert claude_price("claude-sonnet-5-5") is None  # not in the catalog: the budget counts it at the top price


# settings and wiring -----------------------------------------------------------------------------------------

def test_llm_settings_defaults_and_limits():
    settings = Settings(_env_file=None)
    assert (settings.reasoner, settings.llm_provider, settings.effective_llm_model) == \
        ("rule_based", "ollama", "qwen2.5:3b")
    assert Settings(_env_file=None, llm_provider="claude").effective_llm_model == "claude-sonnet-5"
    assert isinstance(build_reasoner(settings), RuleBasedReasoner)
    for bad in ({"llm_temperature": 0.5}, {"ollama_num_ctx": 4096}, {"ollama_timeout_seconds": 0}):
        with pytest.raises(ValueError):
            Settings(_env_file=None, **bad)


def test_claude_needs_a_key_from_the_environment(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="needs ANTHROPIC_API_KEY"):
        build_reasoner(Settings(_env_file=None, reasoner="llm", llm_provider="claude"))


def test_the_ollama_reasoner_is_built_and_checked_at_startup(monkeypatch):
    checked = []
    monkeypatch.setattr(OllamaClient, "check", lambda self: checked.append(self.model))
    reasoner = build_reasoner(Settings(_env_file=None, reasoner="llm", llm_model="qwen2.5:7b"))
    assert isinstance(reasoner, LlmReasoner) and checked == ["qwen2.5:7b"]
