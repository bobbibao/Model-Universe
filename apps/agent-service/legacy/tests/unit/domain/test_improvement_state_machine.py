import pytest

from ci_agent.domain.errors import IntegrityError, InvalidTransition, RuleViolation
from ci_agent.domain.models.finding import Cause, Finding
from ci_agent.domain.models.human import Answer, AnswerDecision, Question, QuestionStatus
from ci_agent.domain.models.improvement import Improvement, ImprovementStatus
from ci_agent.domain.models.plan import ActionPlan, MeasurementPlan, PlannedAction
from tests.support.factories import NOW, make_directive, make_option, make_signal


def make_improvement() -> Improvement:
    return Improvement.detect("imp-1", make_signal(), NOW)


def make_finding(actionable=True) -> Finding:
    option = make_option()
    return Finding(signal_id="sig-1", summary="summary", causes=(Cause("cause", 0.8),), sop_refs=("SOP-001",),
                   similar_case_ids=(), options=(option,) if actionable else (), actionable=actionable,
                   confidence=0.8)


def make_question(imp: Improvement) -> Question:
    finding = imp.finding or make_finding()
    return Question("q1", imp.id, "prompt", "context", finding.options, NOW, NOW.replace(hour=20))


def test_detect_starts_in_detected():
    imp = make_improvement()
    assert imp.status is ImprovementStatus.DETECTED
    assert imp.phase.value == "detect"
    events = imp.pull_events()
    assert events[0].type == "improvement.detected"


def test_investigate_then_ask_then_approve():
    imp = make_improvement()
    imp.start_investigation(NOW)
    imp.record_finding(make_finding(), NOW)
    question = make_question(imp)
    imp.open_question(question, NOW)
    assert imp.status is ImprovementStatus.AWAITING_HUMAN

    directive = make_directive()
    answer = Answer(question.id, AnswerDecision.APPROVE, "user:bob", "web", NOW, "discount")
    imp.record_answer(answer, directive, NOW)
    assert imp.status is ImprovementStatus.APPROVED
    assert imp.directive is directive


def test_dismiss_when_not_actionable():
    imp = make_improvement()
    imp.start_investigation(NOW)
    with pytest.raises(RuleViolation):
        imp.open_question(make_question(imp), NOW)  # no finding yet
    imp.record_finding(make_finding(actionable=False), NOW)
    with pytest.raises(RuleViolation):
        imp.open_question(make_question(imp), NOW)
    imp.dismiss("no viable option", NOW)
    assert imp.status is ImprovementStatus.DISMISSED


def test_reject_answer_moves_to_rejected():
    imp = make_improvement()
    imp.start_investigation(NOW)
    imp.record_finding(make_finding(), NOW)
    question = make_question(imp)
    imp.open_question(question, NOW)
    answer = Answer(question.id, AnswerDecision.REJECT, "user:bob", "web", NOW, note="too risky")
    imp.record_answer(answer, None, NOW)
    assert imp.status is ImprovementStatus.REJECTED


def test_clarify_reopens_investigation_and_keeps_note():
    imp = make_improvement()
    imp.start_investigation(NOW)
    imp.record_finding(make_finding(), NOW)
    question = make_question(imp)
    imp.open_question(question, NOW)
    answer = Answer(question.id, AnswerDecision.CLARIFY, "user:bob", "web", NOW, note="check other channel")
    imp.record_answer(answer, None, NOW)
    assert imp.status is ImprovementStatus.INVESTIGATING
    assert imp.finding_stale is True
    assert imp.human_notes == ["check other channel"]
    assert question.status is QuestionStatus.ANSWERED


def test_expire_question_when_due():
    imp = make_improvement()
    imp.start_investigation(NOW)
    imp.record_finding(make_finding(), NOW)
    question = make_question(imp)
    imp.open_question(question, NOW)
    assert imp.expire_question_if_due(NOW) is False  # not due yet
    assert imp.expire_question_if_due(question.expires_at) is True
    assert imp.status is ImprovementStatus.EXPIRED


def _approved_improvement() -> Improvement:
    imp = make_improvement()
    imp.start_investigation(NOW)
    imp.record_finding(make_finding(), NOW)
    question = make_question(imp)
    imp.open_question(question, NOW)
    imp.record_answer(Answer(question.id, AnswerDecision.APPROVE, "user:bob", "web", NOW, "discount"),
                      make_directive(), NOW)
    return imp


def test_plan_hash_integrity_blocks_tampering():
    imp = _approved_improvement()
    actions = (PlannedAction("apply_discount", {"skus": ["A1", "A2"], "percent": 20}),)
    plan = ActionPlan.create("discount", actions, MeasurementPlan(("dead_stock_value",), 14))
    imp.attach_plan(plan, NOW)
    plan.actions[0].params["percent"] = 90  # tamper after attaching (params dict is mutable)
    with pytest.raises(IntegrityError):
        imp.start_action({}, NOW)


def test_full_happy_path_to_closed():
    imp = _approved_improvement()
    actions = (PlannedAction("apply_discount", {"skus": ["A1", "A2"], "percent": 20}),)
    plan = ActionPlan.create("discount", actions, MeasurementPlan(("dead_stock_value",), 14))
    imp.attach_plan(plan, NOW)
    imp.start_action({"dead_stock_value": 1000.0}, NOW)
    imp.mark_acted(NOW)
    imp.start_measuring(NOW, NOW)
    from ci_agent.domain.models.measurement import KpiDelta, MeasurementResult, Verdict
    result = MeasurementResult((KpiDelta("dead_stock_value", 1000.0, 400.0, -60.0, True, 60.0),),
                               Verdict.SUCCESS, NOW, "improved")
    imp.record_measurement(result, NOW)
    assert imp.status is ImprovementStatus.LEARNING
    imp.close("case-1", NOW)
    assert imp.status is ImprovementStatus.CLOSED
    assert imp.case_id == "case-1"


def test_cannot_skip_states():
    imp = make_improvement()
    with pytest.raises(InvalidTransition):
        imp.open_question(make_question(imp), NOW)
