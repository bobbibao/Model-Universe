"""Centralised, validated configuration (pydantic-settings reads .env automatically)."""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # LLM (swap providers via env only, see infrastructure/reasoning/llm_factory.py)
    llm_provider: Literal["anthropic", "ollama"] = "anthropic"
    llm_model: str = "claude-sonnet-4-6"
    llm_api_key: str | None = None
    llm_api_base: str | None = None
    reasoner: Literal["rule_based", "llm"] = "rule_based"  # llm requires ROADMAP T-01

    # Persistence
    database_url: str = "postgresql+psycopg://app:app@localhost:5432/sme"
    shop_read_dsn: str = "postgresql://ci_reader:reader@localhost:5432/sme"

    # Web integration
    web_base_url: str = "http://localhost:3000"
    shop_api_base_url: str = "http://localhost:3000/api/agent/v1"
    shop_api_token: str = "change-me"
    web_events_url: str = "http://localhost:3000/api/agent/v1/events"
    web_events_secret: str = "change-me"
    signing_secret: str = "change-me"

    # Notification channels (leave blank to disable a channel)
    telegram_bot_token: str | None = None
    telegram_webhook_secret: str | None = None
    zalo_access_token: str | None = None
    smtp_host: str = "localhost"
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_sender: str = "agent@example.com"

    # Operations
    autonomy_mode: Literal["always_ask", "auto_low_risk"] = "always_ask"
    max_auto_approve_cost: float = 200.0
    question_ttl_hours: int = 48
    signal_cooldown_hours: int = 72
    scheduler_interval_minutes: int = 15


@lru_cache
def get_settings() -> Settings:
    return Settings()
