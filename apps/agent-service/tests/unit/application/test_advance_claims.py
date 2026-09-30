"""One runner per improvement (T-09 review R1/R2): a scheduled run and a web decision never advance the same
improvement at once; a decision that is saved is never reported as an error because another run continues it."""
from datetime import UTC, datetime

import pytest

from ci_agent.application.errors import ConflictError, ImprovementBusy
from ci_agent.application.use_cases.submit_answer import Actor, SubmitAnswerCommand
from ci_agent.bootstrap.demo import build_demo_world
from ci_agent.domain.models.human import AnswerDecision
from ci_agent.domain.models.improvement import ImprovementStatus
from ci_agent.domain.models.notification import Role
from ci_agent.infrastructure.shop.fake_shop import FakeShop
from ci_agent.infrastructure.system.clock import ManualClock

BOB = Actor("bob", Role.MANAGER, "web")


def _waiting():
    clock = ManualClock(datetime(2026, 1, 5, 9, tzinfo=UTC))
    world = build_demo_world(shop=FakeShop.seed_demo(clock, n_stock=60, n_returns=15, seed=3), clock=clock)
    world.workflow.coordinator.tick()
    dead = next(i for i in world.workflow.repo.list_recent(50) if i.signal.kind == "dead_stock")
    return world, dead


def _approve(dead):
    return SubmitAnswerCommand(dead.current_question.id, AnswerDecision.APPROVE, BOB,
                               dead.current_question.options[0].option_id)


def test_a_second_runner_on_the_same_improvement_is_told_it_is_busy():
    world, dead = _waiting()
    coordinator = world.workflow.coordinator
    with coordinator._claims.claim(dead.id) as claimed:
        assert claimed
        with pytest.raises(ImprovementBusy):
            coordinator.advance(dead.id)
    coordinator.advance(dead.id)  # free again once the first runner is done


def test_a_tick_skips_an_improvement_a_decision_is_advancing_and_the_next_run_takes_it():
    world, dead = _waiting()
    coordinator = world.workflow.coordinator
    world.workflow.coordinator._submit.execute(_approve(dead))  # answer saved: APPROVED, waiting to be advanced
    with coordinator._claims.claim(dead.id):  # the web request is still advancing it
        report = coordinator.tick()
    assert report.skipped == [dead.id] and dead.id not in report.errors
    assert world.workflow.repo.get(dead.id).status is ImprovementStatus.APPROVED  # untouched by the tick
    later = coordinator.tick()
    assert later.advanced[dead.id] == ImprovementStatus.MEASURING.value


def test_a_saved_decision_is_not_an_error_when_another_run_is_advancing_it():
    world, dead = _waiting()
    coordinator = world.workflow.coordinator
    with coordinator._claims.claim(dead.id):
        result = coordinator.submit_answer(_approve(dead))
    assert result.status is ImprovementStatus.APPROVED and result.answers  # recorded, continued by the other run


def test_a_saved_decision_is_not_an_error_when_another_run_saved_first():
    world, dead = _waiting()
    coordinator = world.workflow.coordinator

    def lost_the_race(_improvement_id, _max_steps=20):
        raise ConflictError("Improvement was modified concurrently")

    coordinator._advance = lost_the_race
    assert coordinator.submit_answer(_approve(dead)).answers


def test_answering_a_closed_question_is_still_a_conflict():
    world, dead = _waiting()
    coordinator = world.workflow.coordinator
    coordinator.submit_answer(_approve(dead))
    with pytest.raises(ConflictError):
        coordinator.submit_answer(_approve(dead))
