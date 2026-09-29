"""Telegram rendering: approval buttons always, the dashboard URL button only for a public web address."""
from datetime import UTC, datetime

import pytest

from ci_agent.domain.models.human import AnswerDecision
from ci_agent.domain.models.notification import (
    Notification,
    NotificationAction,
    NotificationKind,
)
from ci_agent.domain.models.signal import Severity
from ci_agent.infrastructure.http.recording import RecordingHttpClient
from ci_agent.infrastructure.notifications.telegram import (
    TelegramChannel,
    parse_callback_data,
)

NOTIFICATION = Notification(
    id="n-1", kind=NotificationKind.QUESTION, improvement_id="imp-1", recipient_id="1", title="Decision needed",
    body="...", severity=Severity.MEDIUM, created_at=datetime(2026, 1, 5, tzinfo=UTC), question_id="q-1",
    link_path="/ci/improvements/imp-1",
    actions=(NotificationAction("q-1:discount", "Approve: discount", AnswerDecision.APPROVE, "discount"),
             NotificationAction("q-1:reject", "Reject", AnswerDecision.REJECT)))


def _buttons(web_base_url: str) -> list[dict]:
    payload = TelegramChannel("token", RecordingHttpClient(), web_base_url).build_payload(NOTIFICATION, "42")
    return [row[0] for row in payload["reply_markup"]["inline_keyboard"]]


@pytest.mark.parametrize("base", ["http://localhost:6050", "http://127.0.0.1:6050", "http://shop.local", ""])
def test_no_dashboard_button_for_a_non_public_web_address(base):
    buttons = _buttons(base)
    assert [parse_callback_data(b["callback_data"]) for b in buttons] == [("q-1", "discount"), ("q-1", "reject")]
    assert not any("url" in b for b in buttons)


def test_dashboard_button_for_a_public_web_address():
    assert _buttons("https://shop.example.com")[-1]["url"] == "https://shop.example.com/ci/improvements/imp-1"
