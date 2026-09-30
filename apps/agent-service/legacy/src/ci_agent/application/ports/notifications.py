from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from ci_agent.domain.models.notification import ChannelType, Notification, Recipient, Role


@dataclass(frozen=True)
class DeliveryResult:
    ok: bool
    detail: str = ""


class NotificationChannelPort(Protocol):
    channel: ChannelType

    def send(self, notification: Notification, recipient: Recipient) -> DeliveryResult:
        """Deliver one notification. Must not raise for expected failures; return ok=False."""


class RecipientDirectoryPort(Protocol):
    def get(self, user_id: str) -> Recipient | None: ...

    def approvers_for(self, minimum_role: Role) -> list[Recipient]: ...

    def admins(self) -> list[Recipient]: ...

    def resolve_identity(self, channel: ChannelType, external_id: str) -> Recipient | None:
        """Map a channel identity (Telegram chat id, Zalo user id, email) to a known user."""
