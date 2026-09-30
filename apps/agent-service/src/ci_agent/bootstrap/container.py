"""Composition root for a real deployment: the only module that chooses concrete adapters.

Swap an adapter (e.g. Postgres in place of in-memory) here, nowhere else.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path

from ci_agent.application.ports.knowledge import CaseMemoryPort
from ci_agent.application.ports.notifications import NotificationChannelPort, RecipientDirectoryPort
from ci_agent.application.ports.reasoning import ReasoningPort
from ci_agent.application.ports.repositories import (
    AuditLogPort,
    ImprovementRepository,
    NotificationLogPort,
)
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
from ci_agent.infrastructure.notifications.sql_directory import SqlRecipientDirectory
from ci_agent.infrastructure.notifications.telegram import TelegramChannel
from ci_agent.infrastructure.notifications.web_inbox import WebInboxChannel
from ci_agent.infrastructure.notifications.zalo import ZaloChannel
from ci_agent.infrastructure.persistence.in_memory import (
    InMemoryAuditLog,
    InMemoryCaseMemory,
    InMemoryImprovementRepository,
    InMemoryNotificationLog,
)
from ci_agent.infrastructure.persistence.postgres.database import Database
from ci_agent.infrastructure.persistence.postgres.repository import (
    PostgresImprovementRepository,
)
from ci_agent.infrastructure.persistence.postgres.stores import (
    PostgresAuditLog,
    PostgresCaseMemory,
    PostgresLlmSpend,
    PostgresNotificationLog,
)
from ci_agent.infrastructure.reasoning.llm_clients import ClaudeClient, OllamaClient
from ci_agent.infrastructure.reasoning.llm_facts import LARGE_MODEL, SMALL_MODEL
from ci_agent.infrastructure.reasoning.llm_reasoner import (
    InMemorySpendStore,
    LlmReasoner,
    SpendStore,
)
from ci_agent.infrastructure.reasoning.rule_based import RuleBasedReasoner
from ci_agent.infrastructure.shop.fake_shop import FakeShop
from ci_agent.infrastructure.shop.http_action import HttpShopActionAdapter
from ci_agent.infrastructure.shop.sql_read import SqlShopReadAdapter
from ci_agent.infrastructure.system.clock import SystemClock
from ci_agent.infrastructure.system.ids import UuidGenerator
from ci_agent.infrastructure.system.signer import HmacTokenSigner

# NOTE: SOP knowledge and case search are keyword-based (ROADMAP T-06), the recipient directory is a static file
# (T-08) and events are published best effort after each save (T-07 outbox). Swap them here once implemented;
# nothing else in the app needs to change.

logger = logging.getLogger(__name__)


def build_reasoner(settings: Settings, money: MoneyFormat | None = None,
                   llm_spend: SpendStore | None = None) -> ReasoningPort:
    """REASONER=llm: the LLM reasoner over the configured provider (docs/adr/0008), with the rules as fallback."""
    if settings.reasoner != "llm":
        return RuleBasedReasoner()
    model = settings.effective_llm_model
    if settings.llm_provider == "claude":
        if not settings.anthropic_api_key:
            raise RuntimeError("LLM_PROVIDER=claude needs ANTHROPIC_API_KEY in the environment (never in the repo).")
        reasoner = LlmReasoner(ClaudeClient(model, settings.anthropic_api_key, settings.claude_timeout_seconds),
                               money, LARGE_MODEL, daily_budget_usd=settings.llm_daily_budget_usd, spend_store=llm_spend,
                               cooldown_s=settings.llm_cooldown_seconds, lock_wait_s=settings.claude_timeout_seconds)
    else:
        client = OllamaClient(model, settings.ollama_base_url, settings.ollama_timeout_seconds,
                              settings.ollama_num_ctx, settings.llm_temperature)
        reasoner = LlmReasoner(client, money, SMALL_MODEL, cooldown_s=settings.llm_cooldown_seconds,
                               lock_wait_s=settings.ollama_timeout_seconds)
    reasoner.check()  # logs a bad model id, a bad key or a model that is not pulled at startup
    return reasoner


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


@dataclass
class Persistence:
    repo: ImprovementRepository
    case_memory: CaseMemoryPort
    audit: AuditLogPort
    notification_log: NotificationLogPort
    llm_spend: SpendStore
    database: Database | None = None


def build_persistence(settings: Settings) -> Persistence:
    """PERSISTENCE_ADAPTER=postgres: the agent's own database (ROADMAP T-02), schema applied at startup."""
    if settings.persistence_adapter == "memory":
        logger.warning("PERSISTENCE_ADAPTER=memory: improvements, questions, cases and logs are lost on restart. "
                       "Development only.")
        return Persistence(InMemoryImprovementRepository(), InMemoryCaseMemory(), InMemoryAuditLog(),
                           InMemoryNotificationLog(), InMemorySpendStore())
    if not settings.database_url:
        raise RuntimeError("PERSISTENCE_ADAPTER=postgres needs DATABASE_URL: the agent's own database as the ci_agent "
                           "role (infra/sql/ci_agent.sql). For development without it, set PERSISTENCE_ADAPTER=memory.")
    database = Database.open(settings.database_url)
    return Persistence(PostgresImprovementRepository(database), PostgresCaseMemory(database),
                       PostgresAuditLog(database), PostgresNotificationLog(database), PostgresLlmSpend(database),
                       database)


def build_directory(settings: Settings) -> RecipientDirectoryPort:
    """Approvers: the web's active admins (T-08) with RECIPIENTS_FILE for channel handles, or the file alone."""
    file = StaticRecipientDirectory.from_json_file(Path(settings.recipients_file)) if settings.recipients_file else None
    if settings.recipient_source == "web" and settings.shop_read_adapter == "sql" and settings.shop_read_dsn:
        directory = SqlRecipientDirectory(settings.shop_read_dsn, overlay=file)
        directory.check()
        if file is None:
            logger.info("RECIPIENTS_FILE is not set: approvers get the web inbox only (no Telegram or email).")
        return directory
    if file is None:
        logger.warning("RECIPIENTS_FILE is not set: nobody will be notified of questions (they still show in the "
                       "web inbox).")
        return StaticRecipientDirectory.from_dicts([])
    return file


def demo_measure_after(settings: Settings) -> timedelta | None:
    if settings.demo_measure_after_minutes is None:
        return None
    logger.warning("DEMO_MEASURE_AFTER_MINUTES=%s: Measure runs %s minutes after Act instead of the plan's window. Demo "
                   "only (refused with APP_ENV=production).", settings.demo_measure_after_minutes,
                   settings.demo_measure_after_minutes)
    return timedelta(minutes=settings.demo_measure_after_minutes)


@dataclass
class Container:
    settings: Settings
    workflow: Workflow
    database: Database | None = None  # closed at shutdown

    def close(self) -> None:
        if self.database is not None:
            self.database.close()


def build_container(settings: Settings | None = None) -> Container:
    s = settings or get_settings()
    http = UrllibJsonHttpClient()
    signer = HmacTokenSigner(s.signing_secret)
    publisher = WebWebhookPublisher(s.web_events_url, s.web_events_secret, http)

    channels: list[NotificationChannelPort] = [WebInboxChannel(publisher)]
    if s.telegram_bot_token:
        channels.append(TelegramChannel(s.telegram_bot_token, http, s.web_base_url))
    if s.zalo_access_token:
        channels.append(ZaloChannel(s.zalo_access_token, http, s.web_base_url))
    channels.append(EmailChannel(s.smtp_sender, s.web_base_url, s.smtp_host, s.smtp_port,
                                 s.smtp_username, s.smtp_password))

    sop_dir = Path(__file__).resolve().parents[3] / "data" / "sop"
    knowledge = InMemorySopKnowledge.from_directory(sop_dir) if sop_dir.exists() else InMemorySopKnowledge([])

    approver, guardrails = ApproverPolicy(), GuardrailConfig()
    money = MoneyFormat(s.money_unit_vnd)  # agent-written text in VND (T-03c), including what the LLM reads
    options = WorkflowOptions(question_ttl_hours=s.question_ttl_hours, cooldown_hours=s.signal_cooldown_hours,
                              autonomy=AutonomyPolicy(ApprovalMode(s.autonomy_mode), s.max_auto_approve_cost),
                              approver_policy=approver, guardrails=guardrails, money=money,
                              demo_measure_after=demo_measure_after(s))
    log_money_thresholds(s, approver, guardrails)

    clock = SystemClock()
    store = build_persistence(s)
    workflow = build_workflow(
        shop_read=build_shop_read(s, clock),
        shop_actions=HttpShopActionAdapter(s.shop_api_base_url, s.shop_api_token, http),
        repo=store.repo, case_memory=store.case_memory,  # T-06: vector search in the case memory
        knowledge=knowledge, reasoner=build_reasoner(s, money, store.llm_spend),
        directory=build_directory(s),
        channels=channels, publisher=publisher, audit=store.audit, notification_log=store.notification_log,
        clock=clock, ids=UuidGenerator(), signer=signer, options=options)
    return Container(s, workflow, store.database)
