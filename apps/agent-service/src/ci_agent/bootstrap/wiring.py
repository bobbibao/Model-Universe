"""Composition helper: builds the whole workflow from ports. Stdlib only, used by tests, the
simulator and the settings-driven container. This is the only place that knows every use case."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

from ci_agent.application.ports.events import EventPublisherPort
from ci_agent.application.ports.knowledge import CaseMemoryPort, KnowledgePort
from ci_agent.application.ports.notifications import NotificationChannelPort, RecipientDirectoryPort
from ci_agent.application.ports.reasoning import ReasoningPort
from ci_agent.application.ports.repositories import AuditLogPort, ImprovementRepository, NotificationLogPort
from ci_agent.application.ports.shop import ShopActionPort, ShopReadPort
from ci_agent.application.ports.system import ClockPort, IdGeneratorPort, TokenSignerPort
from ci_agent.application.services.command_executor import CommandExecutor
from ci_agent.application.services.notification_dispatcher import NotificationDispatcher
from ci_agent.application.services.notification_factory import NotificationFactory
from ci_agent.application.services.notification_service import NotificationService
from ci_agent.application.services.recorder import Recorder
from ci_agent.application.use_cases.ask_human import AskHuman
from ci_agent.application.use_cases.detect_signals import DetectSignals
from ci_agent.application.use_cases.execute_plan import ExecutePlan
from ci_agent.application.use_cases.expire_questions import ExpireStaleQuestions
from ci_agent.application.use_cases.investigate import InvestigateImprovement
from ci_agent.application.use_cases.learn import LearnFromImprovement
from ci_agent.application.use_cases.measure_outcome import MeasureOutcome
from ci_agent.application.use_cases.plan_improvement import PlanImprovement
from ci_agent.application.use_cases.submit_answer import SubmitAnswer
from ci_agent.application.workflow import WorkflowCoordinator
from ci_agent.domain.detectors.base import default_detectors
from ci_agent.domain.policies.approval import ApproverPolicy
from ci_agent.domain.policies.autonomy import AutonomyPolicy
from ci_agent.domain.policies.guardrails import GuardrailConfig, default_engine
from ci_agent.domain.strategies.registry import all_strategies


@dataclass(frozen=True)
class WorkflowOptions:
    question_ttl_hours: int = 48
    cooldown_hours: int = 72
    max_questions: int = 3
    max_options: int = 3
    max_action_attempts: int = 2
    link_ttl_hours: int = 72
    guardrails: GuardrailConfig = field(default_factory=GuardrailConfig)
    approver_policy: ApproverPolicy = field(default_factory=ApproverPolicy)
    autonomy: AutonomyPolicy = field(default_factory=AutonomyPolicy)


@dataclass
class Workflow:
    coordinator: WorkflowCoordinator
    repo: ImprovementRepository
    audit: AuditLogPort
    notification_log: NotificationLogPort
    case_memory: CaseMemoryPort
    directory: RecipientDirectoryPort
    signer: TokenSignerPort
    clock: ClockPort
    dispatcher: NotificationDispatcher


def build_workflow(*, shop_read: ShopReadPort, shop_actions: ShopActionPort, repo: ImprovementRepository,
                   case_memory: CaseMemoryPort, knowledge: KnowledgePort, reasoner: ReasoningPort,
                   directory: RecipientDirectoryPort, channels: Iterable[NotificationChannelPort],
                   publisher: EventPublisherPort, audit: AuditLogPort, notification_log: NotificationLogPort,
                   clock: ClockPort, ids: IdGeneratorPort, signer: TokenSignerPort,
                   options: WorkflowOptions | None = None) -> Workflow:
    o = options or WorkflowOptions()
    recorder = Recorder(repo, audit, publisher, clock)
    dispatcher = NotificationDispatcher(channels, notification_log, clock)
    notifier = NotificationService(directory, dispatcher, NotificationFactory(clock, ids, signer, o.link_ttl_hours))

    detect = DetectSignals(shop_read, default_detectors(), repo, recorder, clock, ids, o.cooldown_hours)
    investigate = InvestigateImprovement(shop_read, knowledge, case_memory, reasoner, all_strategies, repo,
                                         recorder, clock, o.max_options)
    ask = AskHuman(repo, reasoner, notifier, recorder, clock, ids, o.approver_policy, o.autonomy, o.question_ttl_hours)
    submit = SubmitAnswer(repo, recorder, clock, o.approver_policy)
    plan = PlanImprovement(shop_read, default_engine(o.guardrails), repo, recorder, clock)
    act = ExecutePlan(shop_read, CommandExecutor(shop_actions, clock), repo, recorder, notifier, clock,
                      o.max_action_attempts)
    measure = MeasureOutcome(shop_read, repo, recorder, notifier, clock)
    learn = LearnFromImprovement(repo, case_memory, reasoner, recorder, notifier, clock, ids)
    expire = ExpireStaleQuestions(repo, recorder, notifier, clock)
    coordinator = WorkflowCoordinator(detect, investigate, ask, submit, plan, act, measure, learn, expire,
                                      repo, recorder, clock, o.max_questions)
    return Workflow(coordinator, repo, audit, notification_log, case_memory, directory, signer, clock, dispatcher)
