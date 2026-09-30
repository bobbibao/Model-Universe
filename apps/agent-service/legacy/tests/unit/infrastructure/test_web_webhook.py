"""The events webhook signature must cover the exact bytes that are sent: the web app verifies the HMAC
over the raw request body, so signing one serialization and sending another can never verify."""
import hashlib
import hmac
import json
from datetime import UTC, datetime

from ci_agent.domain.events import DomainEvent
from ci_agent.infrastructure.events.web_webhook import WebWebhookPublisher
from ci_agent.infrastructure.http.recording import RecordingHttpClient


def test_signature_is_over_the_exact_body_sent():
    http = RecordingHttpClient()
    event = DomainEvent("improvement.status_changed", "imp-1", datetime(2026, 1, 5, 9, tzinfo=UTC),
                        {"to": "awaiting_human", "from": "investigating", "note": "ünïcode"})
    WebWebhookPublisher("http://web/events", "events-secret", http).publish([event])

    (body,) = http.raw_bodies
    _url, sent_payload, headers = http.calls[0]
    expected = "sha256=" + hmac.new(b"events-secret", body, hashlib.sha256).hexdigest()
    assert headers["X-CI-Signature"] == expected
    assert json.loads(body) == sent_payload
    assert sent_payload["events"][0]["improvement_id"] == "imp-1"
