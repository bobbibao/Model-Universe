"""Learn passes every note the approvers wrote to the reasoner, including the reason given with a rejection."""
from datetime import UTC, datetime

from ci_agent.application.ports.reasoning import LessonInput
from ci_agent.application.use_cases.submit_answer import Actor, SubmitAnswerCommand
from ci_agent.bootstrap.demo import build_demo_world
from ci_agent.domain.models.human import AnswerDecision
from ci_agent.domain.models.improvement import ImprovementStatus
from ci_agent.domain.models.notification import Role
from ci_agent.infrastructure.reasoning.rule_based import RuleBasedReasoner
from ci_agent.infrastructure.shop.fake_shop import FakeShop
from ci_agent.infrastructure.system.clock import ManualClock


class RecordingReasoner(RuleBasedReasoner):
    """The rule-based reasoner, remembering what Learn asked it."""

    def __init__(self) -> None:
        super().__init__()
        self.lesson_inputs: list[LessonInput] = []

    def extract_lessons(self, li: LessonInput) -> list[str]:
        self.lesson_inputs.append(li)
        return super().extract_lessons(li)


def _world():
    clock = ManualClock(datetime(2026, 1, 5, 9, tzinfo=UTC))
    shop = FakeShop.seed_demo(clock, n_stock=60, n_returns=15, seed=3)
    reasoner = RecordingReasoner()
    world = build_demo_world(shop=shop, clock=clock, reasoner=reasoner)
    world.workflow.coordinator.tick()
    imp = next(i for i in world.workflow.repo.list_recent(50) if i.current_question is not None)
    return world, reasoner, imp


def _answer(world, imp, decision, note=None, option_id=None):
    return world.workflow.coordinator.submit_answer(SubmitAnswerCommand(
        imp.current_question.id, decision, Actor("bob", Role.MANAGER, "web"), option_id, note=note))


def test_the_reason_given_with_a_rejection_reaches_the_lessons():
    world, reasoner, imp = _world()
    final = _answer(world, imp, AnswerDecision.REJECT, note="Supplier prints a wrong size chart; switch supplier.")
    assert final.status is ImprovementStatus.CLOSED
    assert reasoner.lesson_inputs[-1].human_notes == ("Supplier prints a wrong size chart; switch supplier.",)


def test_clarify_and_reject_notes_both_reach_the_lessons_once_each_in_order():
    world, reasoner, imp = _world()
    _answer(world, imp, AnswerDecision.CLARIFY, note="Is this seasonal?")
    world.workflow.coordinator.tick()  # re-investigates and asks again
    again = world.workflow.repo.get(imp.id)
    assert again.status is ImprovementStatus.AWAITING_HUMAN
    _answer(world, again, AnswerDecision.REJECT, note="Seasonal: keep it until November.")
    assert reasoner.lesson_inputs[-1].human_notes == ("Is this seasonal?", "Seasonal: keep it until November.")


def test_a_rejection_without_a_note_passes_no_notes_and_keeps_the_rule_text():
    world, reasoner, imp = _world()
    final = _answer(world, imp, AnswerDecision.REJECT)
    assert reasoner.lesson_inputs[-1].human_notes == ()
    case = next(c for c in world.workflow.case_memory.list_recent(50) if c.id == final.case_id)
    assert case.lessons == ((f"A human rejected the proposal for {imp.signal.kind}; check option relevance before "
                             "asking again."),)
