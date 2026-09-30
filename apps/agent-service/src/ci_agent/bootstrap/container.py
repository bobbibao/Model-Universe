"""Composition root for a real deployment: the only module that chooses concrete adapters.

Swap an adapter (e.g. Postgres in place of in-memory) here, nowhere else.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

from ci_agent.application.ports.reasoning import ReasoningPort
from ci_agent.application.ports.shop import ShopReadPort
from ci_agent.bootstrap.wiring import Workflow, WorkflowOptions, build_workflow
from ci_agent.config.settings import Settings, get_settings
from ci_agent.domain.models.money import MoneyFormat
from ci_agent.domain.policies.approval import ApproverPolicy
from ci_agent.domain.policies.autonomy import ApprovalMode, AutonomyPolicy
from ci_agent.domain.policies.guardrails import GuardrailConfig
from ci_agent.infrastructure.events.web_webhook import WebWebhookPublisher
from ci_agent.infrastructure.http.client import UrllibJsonHttpClient
from ci_agent.infrastructure.knowledge.in_memory_sop import InMemorySopKnowledge
from ci_agent.infrastructure.notifications.directory import StaticRecipientDirectory
from ci_agent.infrastructure.notifications.email_smtp import EmailChannel
from ci_agent.infrastructure.notifications.telegram import TelegramChannel
from ci_agent.infrastructure.notifications.web_inbox import WebInboxChannel
from ci_agent.infrastructure.notifications.zalo import ZaloChannel
from ci_agent.infrastructure.persistence.in_memory import (InMemoryAuditLog, InMemoryCaseMemory,
                                                           InMemoryImprovementRepository, InMemoryNotificationLog)
from ci_agent.infrastructure.reasoning.rule_based import RuleBasedReasoner
from ci_agent.infrastructure.shop.fake_shop import FakeShop
from ci_agent.infrastructure.shop.http_action import HttpShopActionAdapter
from ci_agent.infrastructure.shop.sql_read import SqlShopReadAdapter
from ci_agent.infrastructure.system.clock import SystemClock
from ci_agent.infrastructure.system.ids import UuidGenerator
from ci_agent.infrastructure.system.signer import HmacTokenSigner

# NOTE: repository, case memory, audit log, SOP knowledge and the shop read port still use
# in-memory/unimplemented adapters (see docs/ROADMAP.md T-02, T-03, T-06, T-08). Swap them
# here once implemented; nothing else in the app needs to change.

logger = logging.getLogger(__name__)


def build_reasoner(settings: Settings) -> ReasoningPort:
    if settings.reasoner == "llm":
        from ci_agent.infrastructure.reasoning.langgraph_reasoner import LangGraphReasoner
        return LangGraphReasoner()  # raises NotImplementedError until T-01 lands
    return RuleBasedReasoner()


def build_shop_read(settings: Settings, clock: SystemClock) -> ShopReadPort:
    if settings.shop_read_adapter == "fake":
        logger.warning("SHOP_READ_ADAPTER=fake: Detect/Measure read in-memory demo data; its SKUs do not exist in "
                       "the web shop, so Act will fail and roll back. Development only.")
        return FakeShop.seed_demo(clock)
    if not settings.shop_read_dsn:
        raise RuntimeError("SHOP_READ_ADAPTER=sql needs SHOP_READ_DSN: a connection as the read-only ci_reader role "
                           "(infra/sql/ci_reader.sql). For development without the web database, set "
                           "SHOP_READ_ADAPTER=fake.")
    adapter = SqlShopReadAdapter(settings.shop_read_dsn, clock, settings.money_unit_vnd)
    adapter.check(strict=settings.app_env == "production")
    return adapter


def log_money_thresholds(settings: Settings, approver: ApproverPolicy, guardrails: GuardrailConfig) -> None:
    """Thresholds are configured in the internal unit; log what they mean in VND."""
    vnd = settings.money_unit_vnd
    logger.info("Money: 1 unit = %s VND. Manager approval above %s VND; auto-approve up to %s VND (AUTONOMY_MODE=%s); "
                "plan cost ceiling %s VND.", f"{vnd:,.0f}", f"{approver.manager_cost_threshold * vnd:,.0f}",
                f"{settings.max_auto_approve_cost * vnd:,.0f}", settings.autonomy_mode,
                f"{guardrails.max_plan_cost * vnd:,.0f}")


def build_directory(settings: Settings) -> StaticRecipientDirectory:
    if settings.recipients_file:
        return StaticRecipientDirectory.from_json_file(Path(settings.recipients_file))
    logger.warning("RECIPIENTS_FILE is not set: nobody will be notified of questions (they still show in the "
                   "web inbox).")
    return StaticRecipientDirectory.from_dicts([])  # TODO T-08: load from the web app's users


@dataclass
class Container:
    settings: Settings
    workflow: Workflow


def build_container(settings: Settings | None = None) -> Container:
    s = settings or get_settings()
    http = UrllibJsonHttpClient()
    signer = HmacTokenSigner(s.signing_secret)
    publisher = WebWebhookPublisher(s.web_events_url, s.web_events_secret, http)

    channels = [WebInboxChannel(publisher)]
    if s.telegram_bot_token:
        channels.append(TelegramChannel(s.telegram_bot_token, http, s.web_base_url))
    if s.zalo_access_token:
        channels.append(ZaloChannel(s.zalo_access_token, http, s.web_base_url))
    channels.append(EmailChannel(s.smtp_sender, s.web_base_url, s.smtp_host, s.smtp_port,
                                 s.smtp_username, s.smtp_password))

    sop_dir = Path(__file__).resolve().parents[3] / "data" / "sop"
    knowledge = InMemorySopKnowledge.from_directory(sop_dir) if sop_dir.exists() else InMemorySopKnowledge([])

    approver, guardrails = ApproverPolicy(), GuardrailConfig()
    options = WorkflowOptions(question_ttl_hours=s.question_ttl_hours, cooldown_hours=s.signal_cooldown_hours,
                              autonomy=AutonomyPolicy(ApprovalMode(s.autonomy_mode), s.max_auto_approve_cost),
                              approver_policy=approver, guardrails=guardrails,
                              money=MoneyFormat(s.money_unit_vnd))  # agent-written text in VND (T-03c)
    log_money_thresholds(s, approver, guardrails)

    clock = SystemClock()
    workflow = build_workflow(
        shop_read=build_shop_read(s, clock),
        shop_actions=HttpShopActionAdapter(s.shop_api_base_url, s.shop_api_token, http),
        repo=InMemoryImprovementRepository(),  # TODO T-02: PostgresImprovementRepository(s.database_url)
        case_memory=InMemoryCaseMemory(),  # TODO T-06: pgvector-backed case memory
        knowledge=knowledge, reasoner=build_reasoner(s),
        directory=build_directory(s),
        channels=channels, publisher=publisher, audit=InMemoryAuditLog(), notification_log=InMemoryNotificationLog(),
        clock=clock, ids=UuidGenerator(), signer=signer, options=options)
    return Container(s, workflow)
