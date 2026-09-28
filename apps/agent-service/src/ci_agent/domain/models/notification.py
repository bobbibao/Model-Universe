"""Notification value objects (channel-agnostic)."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

from ci_agent.domain.models.human import AnswerDecision
from ci_agent.domain.models.signal import Severity


class ChannelType(str, Enum):
    WEB = "web"
    TELEGRAM = "telegram"
    ZALO = "zalo"
    EMAIL = "email"
    CONSOLE = "console"


class NotificationKind(str, Enum):
    QUESTION = "question"
    AUTO_APPROVED = "auto_approved"
    ACTION_EXECUTED = "action_executed"
    ACTION_FAILED = "action_failed"
    MEASUREMENT_READY = "measurement_ready"
    QUESTION_EXPIRED = "question_expired"
    CASE_LEARNED = "case_learned"


class Role(str, Enum):
    STAFF = "staff"
    MANAGER = "manager"
    OWNER = "owner"


ROLE_RANK = {Role.STAFF: 1, Role.MANAGER: 2, Role.OWNER: 3}


def role_at_least(role: Role, minimum: Role) -> bool:
    return ROLE_RANK[role] >= ROLE_RANK[minimum]


@dataclass(frozen=True)
class Recipient:
    user_id: str
    name: str
    role: Role
    handles: dict[ChannelType, str] = field(default_factory=dict)  # channel -> address / chat id
    preferred_channels: tuple[ChannelType, ...] = (ChannelType.WEB,)


@dataclass(frozen=True)
class NotificationAction:
    id: str
    label: str
    decision: AnswerDecision
    option_id: str | None = None


@dataclass(frozen=True)
class Notification:
    id: str
    kind: NotificationKind
    improvement_id: str
    recipient_id: str
    title: str
    body: str
    severity: Severity
    created_at: datetime
    actions: tuple[NotificationAction, ...] = ()
    question_id: str | None = None
    link_path: str = ""
    link_token: str | None = None


@dataclass(frozen=True)
class DeliveryAttempt:
    notification_id: str
    channel: ChannelType
    ok: bool
    detail: str
    attempted_at: datetime
