"""FastAPI application factory. See packages/contracts/openapi/agent-service.yaml for the contract."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from ci_agent.config.settings import Settings, get_settings
from ci_agent.infrastructure.persistence.postgres.database import PersistenceUnavailable
from ci_agent.infrastructure.shop.sql_read import ShopReadUnavailable
from ci_agent.interfaces.http.dependencies import get_container, runs_for
from ci_agent.interfaces.http.routers import improvements, kpi, runs
from ci_agent.interfaces.webhooks.telegram import router as telegram_router
from ci_agent.interfaces.runs import TickScheduler
from ci_agent.interfaces.webhooks.zalo import router as zalo_router

SCHEDULER_STOP_TIMEOUT_S = 10.0  # at shutdown, wait this long for a run in progress


def create_app(settings: Settings | None = None) -> FastAPI:
    s = settings or get_settings()
    if not logging.getLogger().handlers:  # uvicorn configures only its own loggers
        logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Build the container at startup, not on the first request, so configuration problems (e.g. a missing
        # SHOP_READ_DSN) and the money thresholds in VND show up immediately in the log.
        container = app.dependency_overrides.get(get_container, get_container)()
        settings = getattr(container, "settings", s)
        run_manager = runs_for(app, container)
        run_manager.demo = {"measure_after_minutes": settings.demo_measure_after_minutes}
        scheduler = None
        if settings.scheduler_on:
            scheduler = TickScheduler(run_manager, settings.scheduler_interval_minutes * 60)
            scheduler.start()
        yield
        if scheduler is not None and not scheduler.stop(SCHEDULER_STOP_TIMEOUT_S):
            # A run is still going: leave its connections open; the process exit ends it, and the next start resumes
            # it safely (an unsaved step is replayed with the same idempotency keys).
            return
        close = getattr(container, "close", None)  # test overrides may return a bare container
        if callable(close):
            close()

    app = FastAPI(title="SME CI Agent", version="0.1.0", lifespan=lifespan)
    app.include_router(improvements.router)
    app.include_router(runs.router)
    app.include_router(kpi.router)
    app.include_router(telegram_router)
    if s.zalo_access_token:
        # The Zalo webhook trusts the sender id in the body (unverified API shape, docs/ROADMAP.md T-05),
        # so it is only exposed when Zalo is deliberately configured.
        app.include_router(zalo_router)

    @app.exception_handler(PersistenceUnavailable)
    async def persistence_unavailable(_request: Request, exc: PersistenceUnavailable) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": f"Agent database unavailable: {exc}"})

    @app.exception_handler(ShopReadUnavailable)
    async def shop_read_unavailable(_request: Request, exc: ShopReadUnavailable) -> JSONResponse:
        # e.g. "analytics views missing: ...": the operator sees why instead of a generic 500.
        return JSONResponse(status_code=503, content={"detail": f"Shop data unavailable: {exc}"})

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    return app
