"""The decision model client (llm.decide): typed questions out, calibrated answers in, None on any failure."""

import json
from collections.abc import Iterator

import httpx
import pytest

from shop_agent import llm
from shop_agent.config import get_settings

QUESTIONS = {"intent": llm.Choice(instructions="Which?", criteria={"search": "Find kits", "other": None})}


@pytest.fixture(autouse=True)
def configured(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("DECISION_PROVIDER", "typesafe")
    monkeypatch.setenv("TYPESAFE_API_KEY", "test-key")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
    monkeypatch.setattr(llm, "_decision_client", None)


def _transport(monkeypatch: pytest.MonkeyPatch, handler: httpx.MockTransport) -> None:
    client = httpx.AsyncClient(base_url="https://decision.test/v1", transport=handler)
    monkeypatch.setattr(llm, "_decision_http", lambda settings: client)


async def test_decide_sends_typed_questions_and_parses_answers(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"] = request.url.path
        seen["auth"] = request.headers["authorization"]
        seen["body"] = json.loads(request.content)
        answer = {"type": "choice", "choice": "search", "probabilities": {"search": 0.93, "other": 0.07}}
        return httpx.Response(200, json={"answers": {"intent": {**answer, "confidence": 0.9}}, "model": "jev-1.13.0"})

    _transport(monkeypatch, httpx.MockTransport(handler))
    answers = await llm.decide({"message": "kits under 1 million"}, QUESTIONS)
    assert answers is not None
    assert answers["intent"].choice == "search" and answers["intent"].confidence == 0.9
    assert seen["path"] == "/v1/systemone" and seen["auth"] == "Bearer test-key"
    body = seen["body"]
    assert isinstance(body, dict)
    assert body["model"] == "jev-latest"
    assert body["questions"] == {
        "intent": {"type": "choice", "instructions": "Which?", "criteria": {"search": "Find kits", "other": None}}
    }


@pytest.mark.parametrize("status", [401, 429, 500])
async def test_decide_falls_back_to_none_on_errors(monkeypatch: pytest.MonkeyPatch, status: int) -> None:
    _transport(monkeypatch, httpx.MockTransport(lambda request: httpx.Response(status, json={})))
    assert await llm.decide("state", QUESTIONS) is None


async def test_decide_is_off_without_a_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TYPESAFE_API_KEY")
    monkeypatch.setattr(llm, "get_settings", lambda: get_settings().model_copy(update={"typesafe_api_key": None}))

    def fail(settings: object) -> httpx.AsyncClient:
        raise AssertionError("no request without a key")

    monkeypatch.setattr(llm, "_decision_http", fail)
    assert await llm.decide("state", QUESTIONS) is None


def _openrouter(monkeypatch: pytest.MonkeyPatch, **update: object) -> None:
    settings = get_settings().model_copy(update={"decision_provider": "openrouter", "decision_model": None, **update})
    monkeypatch.setattr(llm, "get_settings", lambda: settings)


async def test_decide_through_openrouter_uses_the_decisions_api(monkeypatch: pytest.MonkeyPatch) -> None:
    _openrouter(monkeypatch, openrouter_api_key="or-key")
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["authorization"]
        seen["body"] = json.loads(request.content)
        answer = {"type": "choice", "choice": "search", "confidence": 0.8, "probabilities": {"search": 0.8}}
        usage = {"input_tokens": 40, "output_tokens": 0, "cost": 0.000002}
        return httpx.Response(200, json={"model": "typesafe/jev-1.14", "answers": {"intent": answer}, "usage": usage})

    client = httpx.AsyncClient(
        base_url=get_settings().model_copy(update={"decision_provider": "openrouter"}).decision_endpoint[0],
        transport=httpx.MockTransport(handler),
    )
    monkeypatch.setattr(llm, "_decision_http", lambda settings: client)
    answers = await llm.decide("kits under 1 million", QUESTIONS)
    assert answers is not None and answers["intent"].choice == "search"
    assert seen["url"] == "https://openrouter.ai/api/alpha/decisions" and seen["auth"] == "Bearer or-key"
    body = seen["body"]
    assert isinstance(body, dict)
    assert body["model"] == "~typesafe/jev-latest"
    # OpenRouter requires guidance text for every option and true/false criteria for yes/no questions.
    assert body["questions"]["intent"]["criteria"] == {"search": "Find kits", "other": "other"}


def test_openrouter_yes_no_criteria_name_both_outcomes() -> None:
    body = llm._question_body(
        llm.YesNo(instructions="Is it urgent?", criteria="The customer needs it today"), "openrouter"
    )
    assert body["criteria"] == {
        "true": "The customer needs it today",
        "false": "Not the case: The customer needs it today",
    }


def test_openrouter_key_reuses_the_openai_key_only_for_openrouter_profiles() -> None:
    base = get_settings().model_copy(update={"decision_provider": "openrouter", "openrouter_api_key": None})
    assert (
        base.model_copy(update={"llm_profile": "openrouter-fast", "openai_api_key": "sk-or"}).decision_api_key
        == "sk-or"
    )
    assert base.model_copy(update={"llm_profile": "openai", "openai_api_key": "sk-openai"}).decision_api_key is None
