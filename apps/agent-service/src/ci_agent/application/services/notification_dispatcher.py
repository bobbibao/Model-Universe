"""Routes a notification to the right channels, retries, falls back, and logs every attempt.

Routing:
  LOW      -> web inbox only
  MEDIUM   -> web inbox + recipient's first preferred external channel
  HIGH/CRITICAL (and questions) -> web inbox + all preferred external channels
If every external channel fails, fall back to email when the recipient has an address.
"""
from __future__ import annotations

from typing import Iterable, Mapping

from ci_agent.application.ports.notifications import DeliveryResult, NotificationChannelPort
from ci_agent.application.ports.repositories import NotificationLogPort
from ci_agent.application.ports.system import ClockPort
from ci_agent.domain.models.notification import ChannelType, DeliveryAttempt, Notification, Recipient
from ci_agent.domain.models.signal import Severity

_EXTERNAL = (ChannelType.TELEGRAM, ChannelType.ZALO, ChannelType.EMAIL)


class NotificationDispatcher:
    def __init__(self, channels: Iterable[NotificationChannelPort], log: NotificationLogPort, clock: ClockPort,
                 max_attempts: int = 2) -> None:
        self._channels: Mapping[ChannelType, NotificationChannelPort] = {c.channel: c for c in channels}
        self._log, self._clock, self._max_attempts = log, clock, max_attempts

    def route(self, notification: Notification, recipient: Recipient) -> list[ChannelType]:
        external = [c for c in recipient.preferred_channels
                    if c in _EXTERNAL and c in self._channels and c in recipient.handles]
        if notification.severity in (Severity.HIGH, Severity.CRITICAL):
            chosen = external
        elif notification.severity is Severity.MEDIUM:
            chosen = external[:1]
        else:
            chosen = []
        routed = [ChannelType.WEB] if ChannelType.WEB in self._channels else []
        routed += chosen
        if ChannelType.CONSOLE in self._channels:
            routed.append(ChannelType.CONSOLE)
        return routed

    def notify(self, notification: Notification, recipient: Recipient) -> list[DeliveryAttempt]:
        attempts: list[DeliveryAttempt] = []
        tried: set[ChannelType] = set()
        external_ok = False
        routed = self.route(notification, recipient)
        for channel in routed:
            ok = self._send(channel, notification, recipient, attempts)
            tried.add(channel)
            external_ok = external_ok or (ok and channel in _EXTERNAL)
        needs_external = any(c in _EXTERNAL for c in routed)
        if needs_external and not external_ok:
            fallback = ChannelType.EMAIL
            if (fallback not in tried and fallback in self._channels and fallback in recipient.handles):
                self._send(fallback, notification, recipient, attempts)
        return attempts

    def _send(self, channel: ChannelType, notification: Notification, recipient: Recipient,
              attempts: list[DeliveryAttempt]) -> bool:
        port = self._channels[channel]
        result = DeliveryResult(False, "not attempted")
        for _ in range(self._max_attempts):
            try:
                result = port.send(notification, recipient)
            except Exception as exc:  # a channel must never break the workflow
                result = DeliveryResult(False, f"{type(exc).__name__}: {exc}")
            attempt = DeliveryAttempt(notification.id, channel, result.ok, result.detail, self._clock.now())
            self._log.record(attempt)
            attempts.append(attempt)
            if result.ok:
                return True
        return False
