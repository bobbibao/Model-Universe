from __future__ import annotations

import pytest
from pydantic import ValidationError

from shop_agent.config import PLACEHOLDER_SECRET, Settings

STRONG = "x" * 40


def make(**overrides: object) -> Settings:
    return Settings(_env_file=None, **overrides)  # type: ignore[arg-type]


def test_defaults_are_valid_for_dev() -> None:
    settings = make()
    assert settings.app_env == "dev"
    assert settings.agent_language == "vi"
    assert settings.flags.growth is True


def test_production_refuses_placeholder_secrets() -> None:
    with pytest.raises(ValidationError, match="shop_api_token"):
        make(app_env="production", agent_actor_secret=STRONG, llm_profile="anthropic")


def test_production_refuses_short_actor_secret() -> None:
    with pytest.raises(ValidationError, match="at least 32 bytes"):
        make(app_env="production", shop_api_token=STRONG, agent_actor_secret="short", llm_profile="anthropic")


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("llm_profile", "scripted", "LLM_PROFILE=scripted"),
        ("shop_adapter", "fake", "SHOP_ADAPTER must be sql"),
        ("demo_measure_after_minutes", 2, "DEMO_MEASURE_AFTER_MINUTES"),
    ],
)
def test_production_refuses_dev_only_settings(field: str, value: object, message: str) -> None:
    base: dict[str, object] = {
        "app_env": "production",
        "shop_api_token": STRONG,
        "agent_actor_secret": STRONG,
        "llm_profile": "anthropic",
    }
    base[field] = value
    with pytest.raises(ValidationError, match=message):
        make(**base)


def test_production_accepts_real_settings() -> None:
    settings = make(app_env="production", shop_api_token=STRONG, agent_actor_secret=STRONG, llm_profile="anthropic")
    assert settings.shop_api_token != PLACEHOLDER_SECRET


def test_database_urls_must_be_libpq() -> None:
    with pytest.raises(ValidationError, match="libpq"):
        make(database_url="postgresql+psycopg://u:p@h/db")


def test_feature_flags_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FF_MARKET_SCRAPING", "false")
    assert make().flags.market_scraping is False
