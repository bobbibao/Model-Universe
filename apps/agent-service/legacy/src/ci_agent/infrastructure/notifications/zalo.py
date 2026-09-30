"""Zalo Official Account channel.

UNVERIFIED: the endpoint and payload below follow the Zalo OA "send consultation message" API as recalled
when this was written. Verify against the current Zalo OA documentation before production use:
endpoint/version, payload shape, access-token refresh flow, and messaging-window restrictions
(see docs/ROADMAP.md T-05). Zalo replies arrive at interfaces/webhooks/zalo.py; because rich buttons
are limited, this channel sends a signed link to the web approval page instead of inline buttons.
"""
from __future__ import annotations

from ci_agent.application.ports.notifications import DeliveryResult
from ci_agent.domain.models.notification import ChannelType, Notification, Recipient
from ci_agent.infrastructure.http.client import JsonHttpClient

ZALO_OA_MESSAGE_URL = "https://openapi.zalo.me/v3.0/oa/message/cs"  # UNVERIFIED, see module docstring


class ZaloChannel:
    channel = ChannelType.ZALO

    def __init__(self, access_token: str, http: JsonHttpClient, web_base_url: str = "",
                 url: str = ZALO_OA_MESSAGE_URL) -> None:
        self._token, self._http, self._web, self._url = access_token, http, web_base_url.rstrip("/"), url

    def build_payload(self, notification: Notification, zalo_user_id: str) -> dict:
        text = f"{notification.title}\n\n{notification.body}"
        if notification.question_id and notification.link_token and self._web:
            text += f"\n\nAnswer here: {self._web}/ci/questions/{notification.question_id}?t={notification.link_token}"
        return {"recipient": {"user_id": zalo_user_id}, "message": {"text": text[:1900]}}

    def send(self, notification: Notification, recipient: Recipient) -> DeliveryResult:
        user_id = recipient.handles.get(ChannelType.ZALO)
        if not user_id:
            return DeliveryResult(False, "recipient has no Zalo user id")
        resp = self._http.post_json(self._url, self.build_payload(notification, user_id),
                                    {"access_token": self._token})
        ok = resp.status == 200 and resp.body.get("error", 0) == 0
        return DeliveryResult(ok, "" if ok else f"zalo status={resp.status} body={resp.body}")
