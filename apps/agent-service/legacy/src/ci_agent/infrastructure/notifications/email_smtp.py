"""Email channel (SMTP). Approval links carry a signed token so no login is needed to answer."""
from __future__ import annotations

import smtplib
from email.message import EmailMessage
from typing import Callable

from ci_agent.application.ports.notifications import DeliveryResult
from ci_agent.domain.models.notification import ChannelType, Notification, Recipient


def build_email(notification: Notification, recipient: Recipient, sender: str, web_base_url: str) -> EmailMessage:
    to = recipient.handles[ChannelType.EMAIL]
    base = web_base_url.rstrip("/")
    lines = [notification.body, ""]
    if notification.question_id and notification.link_token:
        lines.append("Answer with one click:")
        for a in notification.actions:
            choice = a.option_id or a.decision.value
            lines.append(f"- {a.label}: {base}/ci/questions/{notification.question_id}"
                         f"?t={notification.link_token}&choice={choice}")
    if notification.link_path:
        lines.append(f"\nOpen in the dashboard: {base}{notification.link_path}")
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = notification.title, sender, to
    msg.set_content("\n".join(lines))
    return msg


def _smtp_send(host: str, port: int, username: str | None, password: str | None) -> Callable[[EmailMessage], None]:
    def send(message: EmailMessage) -> None:
        with smtplib.SMTP(host, port, timeout=15) as smtp:
            smtp.starttls()
            if username and password:
                smtp.login(username, password)
            smtp.send_message(message)
    return send


class EmailChannel:
    channel = ChannelType.EMAIL

    def __init__(self, sender: str, web_base_url: str, host: str = "localhost", port: int = 587,
                 username: str | None = None, password: str | None = None,
                 transport: Callable[[EmailMessage], None] | None = None) -> None:
        self._sender, self._web = sender, web_base_url
        self._transport = transport or _smtp_send(host, port, username, password)

    def send(self, notification: Notification, recipient: Recipient) -> DeliveryResult:
        if ChannelType.EMAIL not in recipient.handles:
            return DeliveryResult(False, "recipient has no email address")
        try:
            self._transport(build_email(notification, recipient, self._sender, self._web))
        except (OSError, smtplib.SMTPException) as exc:
            return DeliveryResult(False, f"smtp error: {exc}")
        return DeliveryResult(True)
