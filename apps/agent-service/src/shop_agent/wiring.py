"""Composition root: builds the concrete dependencies (adapters, stores) from settings.

Graphs register `default_deps` with `shop_agent.tools.deps` at import time, so tools resolve their dependencies even
when a run carries no context (copilot chats, cron runs). Nothing below the graphs layer imports this module.
"""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from typing import Any

import psycopg
from langchain_core.callbacks import BaseCallbackHandler
from langfuse import Langfuse
from langfuse.langchain import CallbackHandler
from pydantic import BaseModel

from shop_agent import llm
from shop_agent.adapters.analytics_sql import AnalyticsSql
from shop_agent.adapters.fake_shop import FakeShop
from shop_agent.adapters.market import MarketCollector
from shop_agent.adapters.market.competitor_sites import CompetitorSitesCollector, PlaywrightFetcher
from shop_agent.adapters.market.fixture import FixtureCollector
from shop_agent.adapters.market.google_trends import GoogleTrendsCollector
from shop_agent.adapters.shop_api import AgentApiWriter
from shop_agent.adapters.shop_db import ShopDb
from shop_agent.adapters.vectorstore import CATALOG, DOCUMENTS, KnowledgeBase
from shop_agent.config import FeatureFlags, Settings, get_settings
from shop_agent.domain import pii
from shop_agent.domain.ports import ShopReader, ShopWriter
from shop_agent.logging import get_logger
from shop_agent.tools.deps import ShopDeps, utc_now

logger = get_logger(__name__)


def settings() -> Settings:
    return get_settings()


def knowledge_base(settings: Settings) -> KnowledgeBase | None:
    if not settings.database_url:
        return None
    spec = llm.embedding_spec(settings.llm_profile)
    return KnowledgeBase(
        settings.database_url, llm.embeddings(settings.llm_profile), f"{spec.provider}:{spec.model}", spec.dims
    )


def fake_shop() -> FakeShop:
    """The in-process demo shop. It checks approval grants with the test secret, like `simulate` signs them."""
    from shop_agent.testing.grants import approval_test_secret  # never reached in production (SHOP_ADAPTER=sql)

    return FakeShop.seed_demo(utc_now, grant_secret=approval_test_secret())


async def shop(settings: Settings) -> tuple[ShopReader, ShopWriter]:
    if settings.shop_adapter == "fake":
        fake = fake_shop()
        return fake, fake
    writer = AgentApiWriter(settings.shop_api_base_url, settings.shop_api_token)
    if settings.shop_adapter == "http":  # reads from FakeShop, writes to the Agent API (server tests, web double)
        return fake_shop(), writer
    if not settings.shop_read_dsn:
        raise RuntimeError("SHOP_ADAPTER=sql needs SHOP_READ_DSN (the read-only ci_reader connection)")
    reader = ShopDb(settings.shop_read_dsn)
    await reader.check(strict=settings.app_env == "production")
    return reader, writer


async def build_deps(settings: Settings) -> ShopDeps:
    reader, writer = await shop(settings)
    deps = ShopDeps(reader=reader, writer=writer, model_profile=settings.llm_profile)
    if settings.shop_adapter == "sql" and settings.shop_read_dsn:  # the analyst's SQL needs the real shop database
        deps.analytics = AnalyticsSql(settings.shop_read_dsn)
    kb = knowledge_base(settings)
    if kb is None:
        logger.warning("DATABASE_URL is not set: knowledge search is off")
        return deps
    try:
        await kb.check_model()  # a different embedding model is refused (EmbeddingMismatch propagates)
        missing = await kb.missing_tables()
        if missing:
            logger.warning("knowledge base not ingested yet: run `shop-agent ingest`", missing=missing)
            return deps
        deps.documents = await kb.store(DOCUMENTS)
        deps.catalog = await kb.store(CATALOG)
    except psycopg.OperationalError as exc:
        logger.warning("knowledge base unreachable: knowledge search is off", reason=str(exc).strip())
    return deps


def market_collectors(settings: Settings) -> dict[str, MarketCollector]:
    """The `collect` graph's sources, by name (docs/GROWTH_AGENT.md, "Data sources")."""
    return {
        "fixture": FixtureCollector(),
        "trends": GoogleTrendsCollector(),
        "competitor_sites": CompetitorSitesCollector(
            fetcher_factory=lambda: PlaywrightFetcher(settings.market_chromium_path)
        ),
    }


def enabled_market_sources(flags: FeatureFlags) -> frozenset[str]:
    enabled = {"fixture"}
    if flags.market_trends:
        enabled.add("trends")
    if flags.market_scraping:
        enabled.add("competitor_sites")
    return frozenset(enabled)


def mask_personal_data(*, data: Any, **_: Any) -> Any:
    """Langfuse's mask: emails and phone numbers in what the models read and write never leave the process."""
    if isinstance(data, str):
        return pii.redact(data)
    if isinstance(data, Mapping):
        return {key: mask_personal_data(data=value) for key, value in data.items()}
    if isinstance(data, list | tuple):
        return [mask_personal_data(data=value) for value in data]
    if isinstance(data, BaseModel):  # LangChain messages and documents
        return mask_personal_data(data=data.model_dump())
    return data


def tracing_handler(settings: Settings) -> BaseCallbackHandler | None:
    """Langfuse's LangChain handler (ADR-0012), or None when its keys are not set. Traces carry the environment and
    are masked before export."""
    if not (settings.langfuse_public_key and settings.langfuse_secret_key):
        return None
    Langfuse(
        public_key=settings.langfuse_public_key,
        secret_key=settings.langfuse_secret_key,
        base_url=settings.langfuse_host,
        environment=settings.app_env,
        mask=mask_personal_data,
    )
    return CallbackHandler(public_key=settings.langfuse_public_key)


def traced(graph: Any, name: str) -> Any:
    """`graph` with the tracing handler on every run, tagged with its name; unchanged when tracing is off. Only the
    graphs that call models are traced: `monitor` and `collect` are LLM-free and log through structlog."""
    handler = tracing_handler(get_settings())
    return graph if handler is None else graph.with_config(callbacks=[handler], tags=[name])


_deps: ShopDeps | None = None
_lock = asyncio.Lock()


async def default_deps() -> ShopDeps:
    """The process-wide dependencies, built once on first use."""
    global _deps
    if _deps is None:
        async with _lock:
            if _deps is None:
                _deps = await build_deps(get_settings())
    return _deps


def reset_deps() -> None:
    global _deps
    _deps = None
