from __future__ import annotations

from typing import Callable

from ci_agent.application.ports.notifications import DeliveryResult
from ci_agent.domain.models.notification import ChannelType, Notification, Recipient


class ConsoleChannel:
    """Development channel: prints notifications and records them."""

    channel = ChannelType.CONSOLE

    def __init__(self, write: Callable[[str], None] = print) -> None:
        self._write = write
        self.sent: list[tuple[Notification, Recipient]] = []

    def send(self, notification: Notification, recipient: Recipient) -> DeliveryResult:
        self.sent.append((notification, recipient))
        self._write(f"[console -> {recipient.name}] {notification.title}\n{notification.body}\n")
        return DeliveryResult(True)
