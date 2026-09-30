"""Security pass (phase 3): every agent route, including ones added later, refuses a request without a valid actor
token or webhook secret, except an explicit allowlist; production publishes no API docs."""
from datetime import UTC, datetime

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from ci_agent.bootstrap.container import Container
from ci_agent.bootstrap.demo import build_demo_world
from ci_agent.config.settings import Settings
from ci_agent.interfaces.http.app import create_app
from ci_agent.interfaces.http.dependencies import get_container

SECRET = "test-actor-secret-0123456789abcdef"
PUBLIC = {"/health"}  # liveness only, no data
# Unauthenticated by design and only mounted when Zalo is configured (unverified API shape, ROADMAP T-05).
KNOWN_GAPS = {"/webhooks/zalo"}
PRODUCTION = {"app_env": "production", "shop_api_token": "a", "web_events_secret": "b", "signing_secret": "c",
              "agent_actor_secret": "x" * 32, "database_url": "postgresql://u:p@h/d"}


def _app(**values):
    settings = Settings(_env_file=None, agent_actor_secret=SECRET, zalo_access_token="z", **values)
    app = create_app(settings)
    container = Container(settings, build_demo_world().workflow)
    app.dependency_overrides[get_container] = lambda: container
    return app


def _routes(app):
    return [(method, route.path) for route in app.routes if isinstance(route, APIRoute)
            for method in sorted(route.methods)]


def test_every_route_needs_a_token_or_a_webhook_secret():
    app = _app(telegram_webhook_secret="telegram-secret")
    client = TestClient(app)
    checked = []
    for method, path in _routes(app):
        if path in PUBLIC | KNOWN_GAPS:
            continue
        url = path.replace("{improvement_id}", "some-id")
        for headers in ({}, {"Authorization": "Bearer not.a.token"}):
            response = client.request(method, url, headers=headers, json={})
            assert response.status_code == 401, (method, path, headers, response.status_code)
        checked.append(path)
    assert {"/improvements", "/runs", "/runs/status", "/runs/events", "/kpi/impact", "/cases",
            "/webhooks/telegram"} <= set(checked)


def test_the_allowlist_is_small_and_explicit():
    paths = {path for _, path in _routes(_app())}
    assert PUBLIC | KNOWN_GAPS <= paths and len(PUBLIC | KNOWN_GAPS) == 2


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
def test_production_publishes_no_api_docs(path):
    assert TestClient(_app()).get(path).status_code == 200  # development keeps them
    assert TestClient(create_app(Settings(_env_file=None, **PRODUCTION))).get(path).status_code == 404


def test_a_valid_token_passes():
    from ci_agent.domain.models.notification import Role
    from ci_agent.interfaces.http.auth import mint_actor_token

    settings = Settings(_env_file=None, agent_actor_secret=SECRET)
    token = mint_actor_token("1", Role.OWNER, settings, datetime.now(UTC))
    assert TestClient(_app()).get("/runs/status", headers={"Authorization": f"Bearer {token}"}).status_code == 200
