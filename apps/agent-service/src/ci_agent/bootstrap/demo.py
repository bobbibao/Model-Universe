"""Demo world: everything in memory (FakeShop, rule-based reasoner, fake channels).

Used by `python -m ci_agent.interfaces.cli simulate` and by the end-to-end tests, so the whole
loop can be exercised before the real web app is attached.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from ci_agent.application.ports.knowledge import SopSnippet
from ci_agent.bootstrap.wiring import Workflow, WorkflowOptions, build_workflow
from ci_agent.domain.models.notification import ChannelType
from ci_agent.infrastructure.events.recording import RecordingEventPublisher
from ci_agent.infrastructure.http.recording import RecordingHttpClient
from ci_agent.infrastructure.knowledge.in_memory_sop import InMemorySopKnowledge
from ci_agent.infrastructure.notifications.console import ConsoleChannel
from ci_agent.infrastructure.notifications.directory import StaticRecipientDirectory
from ci_agent.infrastructure.notifications.email_smtp import EmailChannel
from ci_agent.infrastructure.notifications.telegram import TelegramChannel
from ci_agent.infrastructure.notifications.web_inbox import WebInboxChannel
from ci_agent.infrastructure.notifications.zalo import ZaloChannel
from ci_agent.infrastructure.persistence.in_memory import (InMemoryAuditLog, InMemoryCaseMemory,
                                                           InMemoryImprovementRepository, InMemoryNotificationLog)
from ci_agent.infrastructure.reasoning.rule_based import RuleBasedReasoner
from ci_agent.infrastructure.shop.fake_shop import FakeShop
from ci_agent.infrastructure.system.clock import ManualClock
from ci_agent.infrastructure.system.ids import SequentialIds
from ci_agent.infrastructure.system.signer import HmacTokenSigner

DEMO_USERS = [
    {"user_id": "alice", "name": "Alice (staff)", "role": "staff",
     "handles": {"telegram": "1001", "email": "alice@example.com"}, "preferred_channels": ["telegram", "email"]},
    {"user_id": "bob", "name": "Bob (manager)", "role": "manager",
     "handles": {"telegram": "1002", "zalo": "z-2002", "email": "bob@example.com"},
     "preferred_channels": ["zalo", "telegram", "email"]},
    {"user_id": "carol", "name": "Carol (owner)", "role": "owner",
     "handles": {"email": "carol@example.com"}, "preferred_channels": ["email"]},
]

_SOP_DIR = Path(__file__).resolve().parents[3] / "data" / "sop"


@dataclass
class DemoWorld:
    workflow: Workflow
    shop: FakeShop
    clock: ManualClock
    events: RecordingEventPublisher
    telegram_http: RecordingHttpClient
    zalo_http: RecordingHttpClient
    emails: list = field(default_factory=list)
    console: ConsoleChannel | None = None
    ids: SequentialIds | None = None


def build_demo_world(shop: FakeShop | None = None, clock: ManualClock | None = None,
                     options: WorkflowOptions | None = None, echo: bool = False,
                     sop: list[SopSnippet] | None = None) -> DemoWorld:
    clock = clock or ManualClock()
    shop = shop or FakeShop.seed_demo(clock)
    events, telegram_http, zalo_http, emails = RecordingEventPublisher(), RecordingHttpClient(), RecordingHttpClient(), []
    console = ConsoleChannel(write=print if echo else (lambda _msg: None))
    ids = SequentialIds()
    signer = HmacTokenSigner("demo-signing-secret")
    channels = [
        WebInboxChannel(events), console,
        TelegramChannel("demo-bot-token", telegram_http, "http://localhost:3000"),
        ZaloChannel("demo-zalo-token", zalo_http, "http://localhost:3000"),
        EmailChannel("agent@example.com", "http://localhost:3000", transport=emails.append),
    ]
    knowledge = InMemorySopKnowledge(sop) if sop is not None else (
        InMemorySopKnowledge.from_directory(_SOP_DIR) if _SOP_DIR.exists() else InMemorySopKnowledge([]))
    workflow = build_workflow(
        shop_read=shop, shop_actions=shop, repo=InMemoryImprovementRepository(), case_memory=InMemoryCaseMemory(),
        knowledge=knowledge, reasoner=RuleBasedReasoner(), directory=StaticRecipientDirectory.from_dicts(DEMO_USERS),
        channels=channels, publisher=events, audit=InMemoryAuditLog(), notification_log=InMemoryNotificationLog(),
        clock=clock, ids=ids, signer=signer, options=options)
    return DemoWorld(workflow, shop, clock, events, telegram_http, zalo_http, emails, console, ids)



