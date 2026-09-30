"""How persistence is chosen (T-02): Postgres by default and only with a DATABASE_URL, memory refused in production,
an unreachable database answered with 503, and the LLM budget failing closed when its spend cannot be read."""
import logging
from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient

from ci_agent.bootstrap.container import Container, build_persistence
from ci_agent.bootstrap.demo import build_demo_world
from ci_agent.config.settings import Settings
from ci_agent.domain.models.notification import Role
from ci_agent.infrastructure.persistence.in_memory import InMemoryImprovementRepository
from ci_agent.infrastructure.persistence.postgres.database import PersistenceUnavailable
from ci_agent.infrastructure.reasoning.llm_reasoner import DailyBudget, LlmReasoner
from ci_agent.infrastructure.reasoning.rule_based import RuleBasedReasoner
from ci_agent.interfaces.http.app import create_app
from ci_agent.interfaces.http.auth import mint_actor_token
from ci_agent.interfaces.http.dependencies import get_container
from tests.support.fake_llm import FakeLlmClient
from tests.unit.infrastructure.test_llm_reasoner import GOOD, _ctx

PRODUCTION = {"app_env": "production", "shop_api_token": "a", "web_events_secret": "b", "signing_secret": "c",
              "agent_actor_secret": "x" * 32}


def test_postgres_is_the_default_and_needs_a_database_url():
    settings = Settings(_env_file=None)
    assert settings.persistence_adapter == "postgres" and settings.database_url is None
    with pytest.raises(RuntimeError, match="needs DATABASE_URL"):
        build_persistence(settings)


def test_memory_is_for_development_only(caplog):
    with caplog.at_level(logging.WARNING):
        store = build_persistence(Settings(_env_file=None, persistence_adapter="memory"))
    assert isinstance(store.repo, InMemoryImprovementRepository) and store.database is None
    assert "lost on restart" in caplog.text
    with pytest.raises(ValueError, match="PERSISTENCE_ADAPTER=memory"):
        Settings(_env_file=None, persistence_adapter="memory", **PRODUCTION)


def test_a_sqlalchemy_style_url_is_refused_with_a_clear_message():
    with pytest.raises(ValueError, match="libpq URL"):
        Settings(_env_file=None, database_url="postgresql+psycopg://ci_agent:x@localhost/ci_agent")


def test_an_unreachable_agent_database_is_a_503():
    settings = Settings(_env_file=None, agent_actor_secret="test-actor-secret-0123456789abcdef")
    world = build_demo_world()

    def unavailable(limit: int = 50):
        raise PersistenceUnavailable("agent database unreachable: no connection within 10s")

    world.workflow.repo.list_recent = unavailable
    app = create_app(settings)
    app.dependency_overrides[get_container] = lambda: Container(settings, world.workflow)
    token = mint_actor_token("1", Role.OWNER, settings, datetime.now(UTC))
    response = TestClient(app).get("/improvements", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 503
    assert response.json()["detail"] == "Agent database unavailable: agent database unreachable: no connection within 10s"


class BrokenSpend:
    def spent_usd(self, day: date) -> float:
        raise PersistenceUnavailable("down")

    def add_usd(self, day: date, usd: float) -> None:
        raise PersistenceUnavailable("down")


def test_the_llm_budget_fails_closed_when_the_spend_cannot_be_read(caplog):
    reasoner = LlmReasoner(FakeLlmClient(GOOD, cost_usd=0.01), daily_budget_usd=2.0, spend_store=BrokenSpend())
    with caplog.at_level(logging.WARNING):
        assert reasoner.investigate(_ctx()) == RuleBasedReasoner().investigate(_ctx())
    assert reasoner.stats == {"investigate:fallback:budget": 1} and "treating the daily budget as spent" in caplog.text


def test_a_spend_that_cannot_be_recorded_is_logged_not_raised(caplog):
    budget = DailyBudget(2.0, lambda: date(2026, 9, 29), BrokenSpend())
    with caplog.at_level(logging.WARNING):
        budget.add(0.25)
    assert "could not be recorded" in caplog.text
