"""The JSON mapping of the aggregate (T-02) loses nothing: every state a real loop produces survives a JSON round trip,
and a reloaded plan still passes its hash check (Act re-verifies it). No database needed."""
import copy
import dataclasses
import json
from datetime import UTC, datetime

import pytest

from ci_agent.application.use_cases.submit_answer import Actor, SubmitAnswerCommand
from ci_agent.bootstrap.demo import build_demo_world
from ci_agent.domain.models.human import AnswerDecision
from ci_agent.domain.models.improvement import Improvement, ImprovementStatus
from ci_agent.domain.models.notification import Role
from ci_agent.infrastructure.persistence.in_memory import InMemoryImprovementRepository
from ci_agent.infrastructure.persistence.postgres.serialization import (
    PAYLOAD_FORMAT,
    case_from_dict,
    case_to_dict,
    improvement_from_dict,
    improvement_to_dict,
)
from ci_agent.infrastructure.shop.fake_shop import FakeShop
from ci_agent.infrastructure.system.clock import ManualClock


class RecordingRepository(InMemoryImprovementRepository):
    """Keeps a copy of every state that was stored."""

    def __init__(self) -> None:
        super().__init__()
        self.states: list[Improvement] = []

    def add(self, improvement: Improvement) -> None:
        super().add(improvement)
        self.states.append(self.get(improvement.id))

    def save(self, improvement: Improvement) -> None:
        super().save(improvement)
        self.states.append(self.get(improvement.id))


def _run_loop():
    """Detect, clarify, approve, reject, act, measure and learn on the demo shop, recording every stored state."""
    clock = ManualClock(datetime(2026, 1, 5, 9, tzinfo=UTC))
    shop = FakeShop.seed_demo(clock, n_stock=60, n_returns=15, seed=3)
    repo = RecordingRepository()
    world = build_demo_world(shop=shop, clock=clock, repo=repo)
    coordinator, actor = world.workflow.coordinator, Actor("bob", Role.MANAGER, "web")
    coordinator.tick()
    waiting = world.workflow.repo.list_by_status([ImprovementStatus.AWAITING_HUMAN])
    first, *others = waiting
    coordinator.submit_answer(SubmitAnswerCommand(first.current_question.id, AnswerDecision.CLARIFY, actor,
                                                  note="Check the photos first"))
    first = world.workflow.repo.get(first.id)
    coordinator.submit_answer(SubmitAnswerCommand(first.current_question.id, AnswerDecision.APPROVE, actor,
                                                  first.current_question.options[0].option_id))
    for imp in others:
        coordinator.submit_answer(SubmitAnswerCommand(imp.current_question.id, AnswerDecision.REJECT, actor,
                                                      note="not now"))
    clock.advance(days=30)
    shop.advance_days(30)
    coordinator.tick()
    return repo.states, world


STATES, WORLD = _run_loop()


def _json_round_trip(imp: Improvement) -> Improvement:
    return improvement_from_dict(json.loads(json.dumps(improvement_to_dict(imp))), imp.version)


def test_the_loop_covers_the_states_that_matter():
    statuses = {s.status for s in STATES}
    assert {ImprovementStatus.AWAITING_HUMAN, ImprovementStatus.MEASURING, ImprovementStatus.CLOSED} <= statuses
    assert any(s.plan for s in STATES) and any(s.measurement for s in STATES) and any(s.answers for s in STATES)


@pytest.mark.parametrize("index", range(len(STATES)))
def test_every_stored_state_survives_a_json_round_trip(index):
    state = STATES[index]
    expected = copy.deepcopy(state)
    expected.pending_events = []
    assert _json_round_trip(state) == expected
    if state.plan:
        _json_round_trip(state).plan.verify()  # the stored hash still matches the reloaded actions


def test_every_aggregate_field_is_mapped():
    stored = set(improvement_to_dict(STATES[-1])) - {"format"}
    transient = {"pending_events", "version"}  # events are published, the version is the row's column
    assert stored == {f.name for f in dataclasses.fields(Improvement)} - transient


def test_a_tampered_plan_is_still_detected_after_reload():
    from ci_agent.domain.errors import IntegrityError

    state = next(s for s in STATES if s.plan)
    payload = json.loads(json.dumps(improvement_to_dict(state)))
    payload["plan"]["actions"][0]["params"]["percent"] = 90
    with pytest.raises(IntegrityError):
        improvement_from_dict(payload, state.version).plan.verify()


def test_an_unknown_payload_format_is_refused():
    payload = improvement_to_dict(STATES[0])
    payload["format"] = PAYLOAD_FORMAT + 1
    with pytest.raises(ValueError, match="Unsupported improvement payload format"):
        improvement_from_dict(payload, 0)


def test_cases_round_trip():
    case = WORLD.workflow.case_memory.list_recent(1)[0]
    assert case_from_dict(json.loads(json.dumps(case_to_dict(case)))) == case
