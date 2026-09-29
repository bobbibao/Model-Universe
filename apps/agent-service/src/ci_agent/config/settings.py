"""Centralised, validated configuration (pydantic-settings reads .env automatically)."""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_PLACEHOLDER_SECRET = "change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # "production" refuses to start while any shared secret is still the placeholder value
    app_env: Literal["dev", "production"] = "dev"

    # LLM (swap providers via env only, see infrastructure/reasoning/llm_factory.py)
    llm_provider: Literal["anthropic", "ollama"] = "anthropic"
    llm_model: str = "claude-sonnet-4-6"
    llm_api_key: str | None = None
    llm_api_base: str | None = None
    reasoner: Literal["rule_based", "llm"] = "rule_based"  # llm requires ROADMAP T-01

    # Persistence
    database_url: str = "postgresql+psycopg://app:app@localhost:5432/sme"
    # Read-only connection to the web shop's `analytics` views, from the environment only: no default, so no
    # credentials ever live in the repo (template in .env.example; role in infra/sql/ci_reader.sql).
    shop_read_dsn: str | None = None

    # Web integration
    web_base_url: str = "http://localhost:6050"
    shop_api_base_url: str = "http://localhost:6050/api/agent/v1"
    shop_api_token: str = _PLACEHOLDER_SECRET  # agent -> web Agent API (web: AGENT_API_TOKEN)
    web_events_url: str = "http://localhost:6050/api/agent/v1/events"
    web_events_secret: str = _PLACEHOLDER_SECRET  # HMAC for the events webhook (web: AGENT_EVENTS_SECRET)
    signing_secret: str = _PLACEHOLDER_SECRET  # signed answer links

    # Web user -> agent: short-lived actor JWT minted by the web app's admin proxy (see interfaces/http/auth.py)
    agent_actor_secret: str = _PLACEHOLDER_SECRET
    agent_actor_issuer: str = "web-ecommerce"
    agent_actor_audience: str = "ci-agent"

    # Shop reads. "fake" is a development stand-in (in-memory FakeShop data, whose SKUs do not exist in the
    # web shop) until the SQL read adapter lands (docs/ROADMAP.md T-03); "none" disables Detect/Measure.
    shop_read_adapter: Literal["none", "fake"] = "none"

    # Approvers (JSON list, see infrastructure/notifications/directory.py). `user_id` must be the web user id so
    # web decisions and notifications line up. Interim until the directory is loaded from the web app (T-08).
    recipients_file: str | None = None

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

    @model_validator(mode="after")
    def _no_placeholder_secrets_in_production(self) -> Settings:
        if self.app_env == "production":
            unset = [name for name in ("shop_api_token", "web_events_secret", "signing_secret", "agent_actor_secret")
                     if getattr(self, name) in ("", _PLACEHOLDER_SECRET)]
            if unset:
                raise ValueError(f"Set real values for {', '.join(unset)} before running with APP_ENV=production")
            if len(self.agent_actor_secret.encode("utf-8")) < 32:
                raise ValueError("agent_actor_secret must be at least 32 bytes for HS256")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
