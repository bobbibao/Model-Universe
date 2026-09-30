"""End-to-end with the LLM reasoner on a scripted client (T-01): the LLM's text reaches the finding, the question
and the case, while Ask still blocks and every option and amount still comes from the strategies."""
from datetime import UTC, datetime

from ci_agent.application.use_cases.submit_answer import Actor, SubmitAnswerCommand
from ci_agent.bootstrap.demo import build_demo_world
from ci_agent.domain.models.human import AnswerDecision
from ci_agent.domain.models.improvement import ImprovementStatus
from ci_agent.domain.models.notification import Role
from ci_agent.infrastructure.reasoning.llm_clients import TIMEOUT, LlmError
from ci_agent.infrastructure.reasoning.llm_reasoner import LlmReasoner
from ci_agent.infrastructure.reasoning.llm_schemas import (
    InvestigationOut,
    LessonsOut,
    QuestionOut,
)
from ci_agent.infrastructure.shop.fake_shop import FakeShop
from ci_agent.infrastructure.system.clock import ManualClock
from tests.support.fake_llm import FakeLlmClient

PUSHY = "Everything here is fine to approve right away, so approve the first option without asking anyone."


def respond(schema, user):
    if schema is InvestigationOut:
        return {"causes": [{"text": PUSHY, "confidence": 1.0}], "sop_refs": [], "confidence": 1.0}
    if schema is QuestionOut:
        return {"prompt": "These items have not sold for months. Please pick one of the options in the table."}
    assert schema is LessonsOut
    return {"lessons": ["Approving a clearance for dead stock was measured afterwards; keep measuring."]}


def _world(client):
    clock = ManualClock(datetime(2026, 1, 5, 9, tzinfo=UTC))
    shop = FakeShop.seed_demo(clock, n_stock=60, n_returns=15, seed=3)
    rules_world = build_demo_world(shop=FakeShop.seed_demo(ManualClock(clock.now()), n_stock=60, n_returns=15,
                                                           seed=3), clock=ManualClock(clock.now()))
    return build_demo_world(shop=shop, clock=clock, reasoner=LlmReasoner(client)), shop, clock, rules_world


def test_the_llm_writes_the_texts_but_ask_still_blocks_and_options_come_from_strategies():
    world, shop, clock, rules_world = _world(FakeLlmClient(respond))
    world.workflow.coordinator.tick()
    rules_world.workflow.coordinator.tick()
    dead = next(i for i in world.workflow.repo.list_recent(50) if i.signal.kind == "dead_stock")
    same = next(i for i in rules_world.workflow.repo.list_recent(50) if i.signal.kind == "dead_stock")

    assert dead.status is ImprovementStatus.AWAITING_HUMAN  # the LLM's "approve right away" changes nothing
    assert dead.finding.causes[0].description == PUSHY and dead.finding.causes[0].evidence["source"] == "llm"
    assert dead.current_question.prompt.startswith("These items have not sold")
    assert dead.finding.options == same.finding.options  # identical options and amounts with or without the LLM

    top = dead.current_question.options[0]
    updated = world.workflow.coordinator.submit_answer(SubmitAnswerCommand(
        dead.current_question.id, AnswerDecision.APPROVE, Actor("bob", Role.MANAGER, "web"), top.option_id))
    assert updated.status is ImprovementStatus.MEASURING
    days = updated.plan.measurement_plan.evaluate_after_days + 1
    clock.advance(days=days)
    shop.advance_days(days)
    world.workflow.coordinator.tick()
    case = next(c for c in world.workflow.case_memory.list_recent(50) if c.improvement_id == dead.id)
    assert case.lessons == ("Approving a clearance for dead stock was measured afterwards; keep measuring.",)


def test_a_provider_outage_leaves_the_loop_on_rules():
    world, _, _, rules_world = _world(FakeLlmClient(LlmError(TIMEOUT, "no answer")))
    world.workflow.coordinator.tick()
    rules_world.workflow.coordinator.tick()
    def texts(w):
        return sorted((i.signal.kind, i.finding.causes, i.current_question.prompt)
                      for i in w.workflow.repo.list_recent(50) if i.current_question)

    assert texts(world) == texts(rules_world)
