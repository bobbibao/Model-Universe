"""Validated configuration from the environment (pydantic-settings reads `.env`).

Rollout switches are typed feature flags (`FF_*`, `FeatureFlags`). Business controls that the owner changes at runtime
(kill switch, autonomy per capability, caps, goal) live in the web app's `agent_setting` table instead.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import BaseModel, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PLACEHOLDER_SECRET = "change-me"  # noqa: S105 - the "not configured" marker, refused in production
MIN_SECRET_BYTES = 32  # HS256 keys (actor tokens, approval grants)

AppEnv = Literal["dev", "test", "production"]
ShopAdapter = Literal["sql", "fake", "http"]


class FeatureFlags(BaseModel):
    """Rollout flags, read from `FF_<NAME>` environment variables (see `Settings.flags`)."""

    growth: bool = True
    market_trends: bool = True
    market_scraping: bool = True  # own-site allowlist only; marketplaces are hard-denylisted in code


class Settings(BaseSettings):
    # An empty variable (docker compose forwards unset ones as "") means "not set".
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_ignore_empty=True)

    app_env: AppEnv = "dev"
    # Text for people is written in this language; prompts, skills and code stay in English.
    agent_language: str = "vi"

    # Models (shop_agent.llm): a profile file in config/llm/, optionally overridden per role.
    llm_profile: str = "local"
    llm_model_planner: str | None = None
    llm_model_writer: str | None = None
    llm_model_judge: str | None = None
    llm_model_worker: str | None = None
    ollama_base_url: str = "http://localhost:11434"
    llm_daily_budget_usd: float = 2.0

    # The agent's own database: pgvector knowledge base (and the production checkpointer/store).
    database_url: str | None = None
    # Read-only connection to the shop's `analytics` views as `ci_reader` (infra/sql/ci_reader.sql).
    shop_read_dsn: str | None = None

    # Shop access. "sql" reads views and writes through the Agent API; "fake" is the in-process FakeShop;
    # "http" reads through FakeShop but writes to SHOP_API_BASE_URL (server tests with the web double).
    shop_adapter: ShopAdapter = "sql"
    shop_api_base_url: str = "http://localhost:6050/api/agent/v1"
    shop_api_token: str = PLACEHOLDER_SECRET  # web: AGENT_API_TOKEN

    # How `monitor` reaches this Agent Server to open and resume threads. Unset: the SDK's in-process loopback
    # (langgraph dev). Set it when the runtime has no loopback, e.g. Aegra: http://localhost:2026 (ADR-0013).
    agent_server_url: str | None = None

    # Web user -> agent: short-lived actor JWT minted by the web gateway (packages/contracts/test-vectors).
    agent_actor_secret: str = PLACEHOLDER_SECRET
    agent_actor_issuer: str = "web-ecommerce"
    agent_actor_audience: str = "shop-agent"

    # Loop timing
    approval_ttl_hours: int = 48
    signal_cooldown_hours: int = 72
    # Demo only (refused in production): measure N minutes after Act instead of the plan's window.
    demo_measure_after_minutes: int | None = None
    # Durability test only (refused in production): the process kills itself right after the n-th step of Act reached
    # the shop, before Act's checkpoint (tests/runtime).
    fault_kill_after_step: int | None = None

    # Market data (Phase 5)
    google_trends_credentials: str | None = None  # the official Trends API (alpha): not used yet, see GROWTH_AGENT.md
    # A Chromium for the competitor_sites collector instead of Playwright's download (`playwright install chromium`).
    market_chromium_path: str | None = None

    # Rollout flags (FF_*)
    ff_growth: bool = True
    ff_market_trends: bool = True
    ff_market_scraping: bool = True

    @model_validator(mode="after")
    def _production_rules(self) -> Settings:
        if self.app_env == "production":
            weak = [
                name
                for name in ("shop_api_token", "agent_actor_secret")
                if getattr(self, name) in ("", PLACEHOLDER_SECRET)
            ]
            if weak:
                raise ValueError(f"Set real values for {', '.join(weak)} before running with APP_ENV=production")
            if len(self.agent_actor_secret.encode("utf-8")) < MIN_SECRET_BYTES:
                raise ValueError(f"AGENT_ACTOR_SECRET must be at least {MIN_SECRET_BYTES} bytes for HS256")
            if self.llm_profile == "scripted":
                raise ValueError("LLM_PROFILE=scripted is for tests only; choose a real profile in production")
            if self.shop_adapter != "sql":
                raise ValueError("SHOP_ADAPTER must be sql with APP_ENV=production")
            if self.demo_measure_after_minutes is not None:
                raise ValueError("DEMO_MEASURE_AFTER_MINUTES is for demos only; unset it with APP_ENV=production")
            if self.fault_kill_after_step is not None:
                raise ValueError("FAULT_KILL_AFTER_STEP is for the durability test; unset it with APP_ENV=production")
        for name in ("database_url", "shop_read_dsn"):
            value = getattr(self, name)
            if value and value.startswith("postgresql+"):
                raise ValueError(f"{name.upper()} must be a libpq URL (postgresql://...), without a '+driver' suffix")
        if self.demo_measure_after_minutes is not None and self.demo_measure_after_minutes < 0:
            raise ValueError("DEMO_MEASURE_AFTER_MINUTES must not be negative")
        if self.approval_ttl_hours < 1 or self.signal_cooldown_hours < 0:
            raise ValueError("APPROVAL_TTL_HOURS must be at least 1 and SIGNAL_COOLDOWN_HOURS not negative")
        if self.llm_daily_budget_usd < 0:
            raise ValueError("LLM_DAILY_BUDGET_USD must not be negative")
        return self

    @property
    def flags(self) -> FeatureFlags:
        return FeatureFlags(
            growth=self.ff_growth, market_trends=self.ff_market_trends, market_scraping=self.ff_market_scraping
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
