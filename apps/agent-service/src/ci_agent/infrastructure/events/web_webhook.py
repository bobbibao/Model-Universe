"""Publishes domain events to the web app's webhook, signed with HMAC-SHA256.

Web contract (see packages/contracts/events): POST {WEB_EVENTS_URL} with
  header X-CI-Signature: sha256=<hex hmac of the raw body>
  body   {"events": [{"type", "improvement_id", "occurred_at", "payload"}]}
The web app verifies the signature, then stores notifications, status changes and audit rows.
NOTE: delivery here is best-effort. For at-least-once delivery, back this with the outbox table
(see docs/ROADMAP.md task T-07).
"""
from __future__ import annotations

import hashlib
import hmac
import json
from typing import Sequence

from ci_agent.domain.events import DomainEvent
from ci_agent.infrastructure.http.client import JsonHttpClient


def sign_body(secret: str, body: bytes) -> str:
    return "sha256=" + hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


class WebWebhookPublisher:
    def __init__(self, url: str, secret: str, http: JsonHttpClient) -> None:
        self._url, self._secret, self._http = url, secret, http

    def publish(self, events: Sequence[DomainEvent]) -> None:
        payload = {"events": [{"type": e.type, "improvement_id": e.improvement_id,
                               "occurred_at": e.occurred_at.isoformat(), "payload": e.payload} for e in events]}
        # Serialize once: the receiver verifies the HMAC over the exact bytes it gets.
        body = json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
        self._http.post_bytes(self._url, body, {"X-CI-Signature": sign_body(self._secret, body)})
