from __future__ import annotations

import pytest
from langchain_core.language_models import BaseChatModel

from shop_agent import llm
from shop_agent.config import Settings
from shop_agent.testing.scripted import ScriptedChatModel

HOSTED_KEYS = {"ANTHROPIC_API_KEY": "test", "OPENAI_API_KEY": "test", "GOOGLE_API_KEY": "test"}


def settings(**overrides: object) -> Settings:
    return Settings(_env_file=None, **overrides)  # type: ignore[arg-type]


def test_every_profile_file_validates() -> None:
    assert {"local", "local-small", "local-large", "anthropic", "openai", "google", "scripted"} <= set(llm.PROFILES)
    for profile in llm.PROFILES.values():
        assert set(profile.roles) == set(llm.ModelRole)
        assert profile.embeddings.dims == llm.EMBEDDING_DIMS


@pytest.mark.parametrize(
    "profile_name", ["local", "local-small", "local-large", "anthropic", "openai", "google", "openrouter-fast"]
)
def test_every_role_builds_without_network(profile_name: str, monkeypatch: pytest.MonkeyPatch) -> None:
    for key, value in HOSTED_KEYS.items():
        monkeypatch.setenv(key, value)
    s = settings()
    profile = llm.get_profile(profile_name, s)
    for role in llm.ModelRole:
        model = llm.build_chat_model(llm.role_spec(role, profile, s), s)
        assert isinstance(model, BaseChatModel)
        assert llm.parse_model_ref(f"x:{profile.roles[role].model}")[1] == profile.roles[role].model


def test_ollama_models_get_the_configured_base_url() -> None:
    s = settings(ollama_base_url="http://ollama:11434")
    model = llm.build_chat_model(llm.role_spec(llm.ModelRole.PLANNER, llm.get_profile("local", s), s), s)
    assert getattr(model, "base_url", None) == "http://ollama:11434"
    assert getattr(model, "num_ctx", None) == 16384


def test_per_role_override() -> None:
    s = settings(llm_model_worker="ollama:qwen3.5:4b")
    spec = llm.role_spec(llm.ModelRole.WORKER, llm.get_profile("local", s), s)
    assert (spec.provider, spec.model) == ("ollama", "qwen3.5:4b")
    assert spec.params["num_ctx"] == 16384  # same provider keeps the profile's parameters


def test_override_to_another_provider_drops_provider_parameters() -> None:
    s = settings(llm_model_planner="anthropic:claude-sonnet-5-5")
    spec = llm.role_spec(llm.ModelRole.PLANNER, llm.get_profile("local", s), s)
    assert spec.provider == "anthropic" and spec.params == {}


@pytest.mark.parametrize("ref", ["qwen3.5:9b"[:0], "ollama", ":model", "ollama:"])
def test_bad_model_references(ref: str) -> None:
    with pytest.raises(ValueError, match="provider:model"):
        llm.parse_model_ref(ref)


def test_unknown_profile() -> None:
    with pytest.raises(ValueError, match="unknown LLM profile"):
        llm.get_profile("nope", settings())


def test_scripted_profile_builds_the_scripted_model() -> None:
    s = settings(llm_profile="scripted")
    model = llm.build_chat_model(llm.role_spec(llm.ModelRole.PLANNER, llm.get_profile("scripted", s), s), s)
    assert isinstance(model, ScriptedChatModel)


def test_structured_output_is_native_except_for_the_scripted_model() -> None:
    assert llm.structured_output_method(llm.ModelRole.PLANNER, "anthropic") == "json_schema"
    assert llm.structured_output_method(llm.ModelRole.PLANNER, "local") == "json_schema"
    assert llm.structured_output_method(llm.ModelRole.PLANNER, "scripted") == "function_calling"


def test_prices() -> None:
    anthropic = llm.get_profile("anthropic", settings())
    assert anthropic.price("claude-sonnet-5-5") == (2.0, 10.0)
    assert llm.get_profile("local", settings()).price("qwen3.5:9b") == (0.0, 0.0)


def test_openrouter_profile_keeps_transport_and_structured_method_on_model_override() -> None:
    profile = llm.get_profile("openrouter-fast", settings())
    s = settings(llm_model_planner="openai:openai/gpt-4.1-mini")
    spec = llm.role_spec(llm.ModelRole.PLANNER, profile, s)
    assert spec.structured_method == "function_calling"
    assert spec.params["base_url"] == "https://openrouter.ai/api/v1"
    assert spec.params["max_retries"] == 0
    assert spec.params["max_tokens"] == 4096
    assert llm.structured_output_method(llm.ModelRole.PLANNER, "openrouter-fast") == "function_calling"
    other = llm.role_spec(llm.ModelRole.PLANNER, profile, settings(llm_model_planner="anthropic:claude-sonnet-5-5"))
    assert other.structured_method == "json_schema"
    assert other.params == {}
