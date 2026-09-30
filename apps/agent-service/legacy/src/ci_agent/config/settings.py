"""Centralised, validated configuration (pydantic-settings reads .env automatically)."""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_PLACEHOLDER_SECRET = "change-me"
DEFAULT_LLM_MODELS = {"ollama": "qwen2.5:3b", "claude": "claude-sonnet-5"}


class Settings(BaseSettings):
    # An empty variable (e.g. `DEMO_MEASURE_AFTER_MINUTES=` forwarded by docker compose) means "not set".
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_ignore_empty=True)

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
    # Claude only, per UTC day. Kept in the agent database (ci.llm_spend), so a restart does not reset it.
    llm_daily_budget_usd: float = 2.0
    # After a timeout or an unreachable provider, skip the LLM for this long (answers come from the rules).
    llm_cooldown_seconds: float = 60.0

    # The agent's own state (ROADMAP T-02). "postgres" keeps improvements, cases, logs and the LLM spend in the database
    # created by infra/sql/ci_agent.sql; "memory" loses everything on restart and is refused in production.
    persistence_adapter: Literal["postgres", "memory"] = "postgres"
    # libpq URL as the ci_agent role, from the environment only: no default, so no credentials live in the repo.
    database_url: str | None = None
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
    # Who may approve (T-08): "web" = the web app's active admins (analytics.ci_recipients, via SHOP_READ_DSN), with
    # RECIPIENTS_FILE adding channel handles and serving as the fallback; "file" = RECIPIENTS_FILE only.
    recipient_source: Literal["web", "file"] = "web"

    # Notification channels (leave blank to disable a channel)
    telegram_bot_token: str | None = None
    telegram_webhook_secret: str | None = None
    zalo_access_token: str | None = None
    smtp_host: str = "localhost"
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_sender: str = "agent@example.com"

    # Demo only (refused with APP_ENV=production): measure N minutes after Act instead of the plan's window (14 days),
    # so a demo can show Measure and Learn. The plan, its KPIs and thresholds are unchanged.
    demo_measure_after_minutes: int | None = None

    # Operations
    autonomy_mode: Literal["always_ask", "auto_low_risk"] = "always_ask"
    max_auto_approve_cost: float = 200.0
    question_ttl_hours: int = 48
    signal_cooldown_hours: int = 72
    # Scheduler (ROADMAP T-09): a run every N minutes, counted from the end of the previous run. Unset = on with
    # APP_ENV=production, off in dev (the console's manual run button works either way). Run one agent process only:
    # runs and improvements are serialised per process.
    scheduler_enabled: bool | None = None
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
            if self.demo_measure_after_minutes is not None:
                raise ValueError("DEMO_MEASURE_AFTER_MINUTES is for demos only; unset it with APP_ENV=production")
            if self.persistence_adapter == "memory":
                raise ValueError("PERSISTENCE_ADAPTER=memory loses everything on restart; use postgres with "
                                 "APP_ENV=production")
        if self.database_url and self.database_url.startswith("postgresql+"):
            raise ValueError("DATABASE_URL must be a libpq URL (postgresql://...), without a '+driver' suffix")
        if self.money_unit_vnd <= 0:
            raise ValueError("MONEY_UNIT_VND must be positive")
        if self.scheduler_interval_minutes < 1:
            raise ValueError("SCHEDULER_INTERVAL_MINUTES must be at least 1")
        if self.demo_measure_after_minutes is not None and self.demo_measure_after_minutes < 0:
            raise ValueError("DEMO_MEASURE_AFTER_MINUTES must not be negative")
        if not 0 <= self.llm_temperature <= 0.2:
            raise ValueError("LLM_TEMPERATURE must be between 0 and 0.2")
        if self.ollama_num_ctx < 8192:
            raise ValueError("OLLAMA_NUM_CTX must be at least 8192")
        if min(self.ollama_timeout_seconds, self.claude_timeout_seconds) <= 0 or self.llm_cooldown_seconds < 0:
            raise ValueError("LLM timeouts must be positive and LLM_COOLDOWN_SECONDS not negative")
        return self

    @property
    def scheduler_on(self) -> bool:
        return self.scheduler_enabled if self.scheduler_enabled is not None else self.app_env == "production"

    @property
    def effective_llm_model(self) -> str:
        return self.llm_model or DEFAULT_LLM_MODELS[self.llm_provider]


@lru_cache
def get_settings() -> Settings:
    return Settings()
