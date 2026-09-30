"""Demo path for Measure and Learn (phase 1b): with a demo window, Measure runs minutes after Act instead of after the
plan's 14 days; the plan itself (window, KPIs, threshold) is unchanged, and production refuses the setting."""
from datetime import UTC, datetime, timedelta

import pytest

from ci_agent.application.use_cases.submit_answer import Actor, SubmitAnswerCommand
from ci_agent.bootstrap.container import demo_measure_after
from ci_agent.bootstrap.demo import build_demo_world
from ci_agent.bootstrap.wiring import WorkflowOptions
from ci_agent.config.settings import Settings
from ci_agent.domain.models.human import AnswerDecision
from ci_agent.domain.models.improvement import ImprovementStatus
from ci_agent.domain.models.notification import Role
from ci_agent.infrastructure.shop.fake_shop import FakeShop
from ci_agent.infrastructure.system.clock import ManualClock

PRODUCTION = {"app_env": "production", "shop_api_token": "a", "web_events_secret": "b", "signing_secret": "c",
              "agent_actor_secret": "x" * 32, "database_url": "postgresql://u:p@h/d"}


def _approve(window: timedelta | None):
    clock = ManualClock(datetime(2026, 1, 5, 9, tzinfo=UTC))
    shop = FakeShop.seed_demo(clock, n_stock=60, n_returns=15, seed=3)
    world = build_demo_world(shop=shop, clock=clock, options=WorkflowOptions(demo_measure_after=window))
    world.workflow.coordinator.tick()
    dead = next(i for i in world.workflow.repo.list_recent(50) if i.signal.kind == "dead_stock")
    acted = world.workflow.coordinator.submit_answer(SubmitAnswerCommand(
        dead.current_question.id, AnswerDecision.APPROVE, Actor("bob", Role.MANAGER, "web"),
        dead.current_question.options[0].option_id))
    return world, clock, acted


def test_the_demo_window_measures_and_learns_minutes_after_act():
    world, clock, acted = _approve(timedelta(minutes=5))
    assert acted.status is ImprovementStatus.MEASURING
    assert acted.measure_due_at == clock.now() + timedelta(minutes=5)
    assert acted.plan.measurement_plan.evaluate_after_days == 14  # the plan keeps its own window
    acted_entry = [e for e in world.workflow.audit.list(acted.id) if e.action == "acted"][-1]
    assert acted_entry.detail["demo_measure_after_minutes"] == 5

    clock.advance(minutes=4)
    world.workflow.coordinator.tick()
    assert world.workflow.repo.get(acted.id).status is ImprovementStatus.MEASURING  # not due yet
    clock.advance(minutes=2)
    world.workflow.coordinator.tick()
    closed = world.workflow.repo.get(acted.id)
    assert closed.status is ImprovementStatus.CLOSED and closed.measurement is not None and closed.case_id


def test_without_the_demo_window_the_plan_window_applies():
    world, clock, acted = _approve(None)
    assert acted.measure_due_at == clock.now() + timedelta(days=14)
    assert "demo_measure_after_minutes" not in [e for e in world.workflow.audit.list(acted.id)
                                                if e.action == "acted"][-1].detail


def test_the_demo_window_is_refused_in_production_and_off_by_default():
    assert Settings(_env_file=None).demo_measure_after_minutes is None
    assert demo_measure_after(Settings(_env_file=None)) is None
    assert demo_measure_after(Settings(_env_file=None, demo_measure_after_minutes=3)) == timedelta(minutes=3)
    with pytest.raises(ValueError, match="DEMO_MEASURE_AFTER_MINUTES is for demos only"):
        Settings(_env_file=None, demo_measure_after_minutes=3, **PRODUCTION)
    with pytest.raises(ValueError, match="must not be negative"):
        Settings(_env_file=None, demo_measure_after_minutes=-1)


def test_an_empty_variable_means_not_set(monkeypatch):
    # docker compose forwards `DEMO_MEASURE_AFTER_MINUTES: ${DEMO_MEASURE_AFTER_MINUTES:-}` as an empty string.
    monkeypatch.setenv("DEMO_MEASURE_AFTER_MINUTES", "")
    monkeypatch.setenv("DATABASE_URL", "")
    settings = Settings(_env_file=None)
    assert settings.demo_measure_after_minutes is None and settings.database_url is None
