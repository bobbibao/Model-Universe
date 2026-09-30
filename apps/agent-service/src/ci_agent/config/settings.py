"""Centralised, validated configuration (pydantic-settings reads .env automatically)."""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_PLACEHOLDER_SECRET = "change-me"
DEFAULT_LLM_MODELS = {"ollama": "qwen2.5:3b", "claude": "claude-sonnet-5"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # "production" refuses to start while any shared secret is still the placeholder value
    app_env: Literal["dev", "production"] = "dev"

    # Reasoner (ROADMAP T-01, docs/adr/0008). "llm" explains findings, writes questions and lessons with an LLM and
    # falls back to the rules on any failure; the rules stay the default.
    reasoner: Literal["rule_based", "llm"] = "rule_based"
    llm_provider: Literal["ollama", "claude"] = "ollama"
    llm_model: str | None = None  # default per provider: DEFAULT_LLM_MODELS
    # Ollama (local, no key): generation on a laptop GPU/CPU is slow, hence the long timeout.
    ollama_base_url: str = "http://localhost:11434"
    ollama_timeout_seconds: float = 90.0
    ollama_num_ctx: int = 8192  # explicit: Ollama silently drops the start of a prompt that does not fit
    llm_temperature: float = 0.1  # Ollama only (Claude Sonnet 5 rejects sampling parameters)
    # Claude (official anthropic SDK). The key comes from the environment (ANTHROPIC_API_KEY), never the repo.
    anthropic_api_key: str | None = None
    claude_timeout_seconds: float = 30.0
    # Claude only. In memory: resets at midnight UTC and on restart until the repository is persistent (T-02).
    llm_daily_budget_usd: float = 2.0
    # After a timeout or an unreachable provider, skip the LLM for this long (answers come from the rules).
    llm_cooldown_seconds: float = 60.0

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

    # Shop reads. "sql" reads the web shop's analytics views through SHOP_READ_DSN (infrastructure/shop/sql_read.py).
    # "fake" is a development stand-in (in-memory FakeShop data whose SKUs do not exist in the shop), refused in
    # production.
    shop_read_adapter: Literal["sql", "fake"] = "sql"

    # The domain's internal money unit, in VND. Amounts read from the shop are divided by it and shown multiplied
    # back, so the domain's thresholds and per-unit constants keep their meaning (T-03 decision; the web seed
    # prices are USD x 25,000). Thresholds below (max_auto_approve_cost, ...) are in this unit.
    money_unit_vnd: float = 25_000.0

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
            if self.shop_read_adapter == "fake":
                raise ValueError("SHOP_READ_ADAPTER=fake is for development only; use sql with APP_ENV=production")
        if self.money_unit_vnd <= 0:
            raise ValueError("MONEY_UNIT_VND must be positive")
        if not 0 <= self.llm_temperature <= 0.2:
            raise ValueError("LLM_TEMPERATURE must be between 0 and 0.2")
        if self.ollama_num_ctx < 8192:
            raise ValueError("OLLAMA_NUM_CTX must be at least 8192")
        if min(self.ollama_timeout_seconds, self.claude_timeout_seconds) <= 0 or self.llm_cooldown_seconds < 0:
            raise ValueError("LLM timeouts must be positive and LLM_COOLDOWN_SECONDS not negative")
        return self

    @property
    def effective_llm_model(self) -> str:
        return self.llm_model or DEFAULT_LLM_MODELS[self.llm_provider]


@lru_cache
def get_settings() -> Settings:
    return Settings()
