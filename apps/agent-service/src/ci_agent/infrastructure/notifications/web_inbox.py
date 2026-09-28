"""In-app notifications: publishes a `notification.created` event that the web app stores and shows."""
from __future__ import annotations

from ci_agent.application.ports.events import EventPublisherPort
from ci_agent.application.ports.notifications import DeliveryResult
from ci_agent.domain.events import DomainEvent
from ci_agent.domain.models.notification import ChannelType, Notification, Recipient


def notification_payload(n: Notification) -> dict:
    return {
        "notification_id": n.id, "kind": n.kind.value, "recipient_id": n.recipient_id, "title": n.title,
        "body": n.body, "severity": n.severity.value, "question_id": n.question_id,
        "link_path": n.link_path, "link_token": n.link_token,
        "actions": [{"id": a.id, "label": a.label, "decision": a.decision.value, "option_id": a.option_id}
                    for a in n.actions],
    }


class WebInboxChannel:
    channel = ChannelType.WEB

    def __init__(self, publisher: EventPublisherPort) -> None:
        self._publisher = publisher

    def send(self, notification: Notification, recipient: Recipient) -> DeliveryResult:
        self._publisher.publish([DomainEvent("notification.created", notification.improvement_id,
                                             notification.created_at, notification_payload(notification))])
        return DeliveryResult(True)
