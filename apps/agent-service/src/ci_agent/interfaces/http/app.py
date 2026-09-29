"""FastAPI application factory. See packages/contracts/openapi/agent-service.yaml for the contract."""
from __future__ import annotations

from fastapi import FastAPI

from ci_agent.config.settings import Settings, get_settings
from ci_agent.interfaces.http.routers import improvements, kpi, runs
from ci_agent.interfaces.webhooks.telegram import router as telegram_router
from ci_agent.interfaces.webhooks.zalo import router as zalo_router


def create_app(settings: Settings | None = None) -> FastAPI:
    s = settings or get_settings()
    app = FastAPI(title="SME CI Agent", version="0.1.0")
    app.include_router(improvements.router)
    app.include_router(runs.router)
    app.include_router(kpi.router)
    app.include_router(telegram_router)
    if s.zalo_access_token:
        # The Zalo webhook trusts the sender id in the body (unverified API shape, docs/ROADMAP.md T-05),
        # so it is only exposed when Zalo is deliberately configured.
        app.include_router(zalo_router)

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    return app
