"""Telegram channel (Bot API) with inline approval buttons.

Send:    POST https://api.telegram.org/bot<token>/sendMessage  {chat_id, text, reply_markup}
Answer:  Telegram calls our webhook with a `callback_query` whose data is "ans:<question_id>:<choice>".
         The webhook handler (interfaces/webhooks/telegram.py) maps chat id -> user via the directory.
Setup:   see docs/NOTIFICATIONS.md (create bot, set webhook + secret token, link users' chat ids).
"""
from __future__ import annotations

from urllib.parse import urlparse

from ci_agent.application.ports.notifications import DeliveryResult
from ci_agent.domain.models.notification import ChannelType, Notification, Recipient
from ci_agent.infrastructure.http.client import JsonHttpClient

CALLBACK_PREFIX = "ans"
_MAX_TEXT = 4000


def callback_data(question_id: str, choice: str) -> str:
    return f"{CALLBACK_PREFIX}:{question_id}:{choice}"


def _is_public_url(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return bool(host) and host not in ("localhost", "127.0.0.1", "::1", "0.0.0.0") and not host.endswith(".local")


def parse_callback_data(data: str) -> tuple[str, str] | None:
    parts = data.split(":")
    if len(parts) != 3 or parts[0] != CALLBACK_PREFIX or not parts[1] or not parts[2]:
        return None
    return parts[1], parts[2]


class TelegramChannel:
    channel = ChannelType.TELEGRAM

    def __init__(self, bot_token: str, http: JsonHttpClient, web_base_url: str = "",
                 api_base: str = "https://api.telegram.org") -> None:
        self._token, self._http, self._web, self._api = bot_token, http, web_base_url.rstrip("/"), api_base

    def build_payload(self, notification: Notification, chat_id: str) -> dict:
        text = f"{notification.title}\n\n{notification.body}"[:_MAX_TEXT]
        payload: dict = {"chat_id": chat_id, "text": text}
        rows = []
        for action in notification.actions:
            choice = action.option_id or action.decision.value
            rows.append([{"text": action.label[:60], "callback_data": callback_data(notification.question_id or "", choice)}])
        # Telegram validates button URLs; a localhost link can make the whole sendMessage fail, so the dashboard
        # button is only added when the web app has a public address.
        if _is_public_url(self._web) and notification.link_path:
            suffix = f"?t={notification.link_token}" if notification.link_token else ""
            rows.append([{"text": "Open dashboard", "url": f"{self._web}{notification.link_path}{suffix}"}])
        if rows:
            payload["reply_markup"] = {"inline_keyboard": rows}
        return payload

    def send(self, notification: Notification, recipient: Recipient) -> DeliveryResult:
        chat_id = recipient.handles.get(ChannelType.TELEGRAM)
        if not chat_id:
            return DeliveryResult(False, "recipient has no Telegram chat id")
        resp = self._http.post_json(f"{self._api}/bot{self._token}/sendMessage",
                                    self.build_payload(notification, chat_id))
        ok = resp.status == 200 and resp.body.get("ok") is True
        return DeliveryResult(ok, "" if ok else f"telegram status={resp.status} {resp.body.get('description', '')}")
