"""Telegram webhook: receives button taps (callback_query) and turns them into a SubmitAnswerCommand.

Set the webhook with a secret token (Telegram sends it back in X-Telegram-Bot-Api-Secret-Token) and
verify it here before trusting the payload.
"""
from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from ci_agent.application.errors import ApplicationError
from ci_agent.application.use_cases.submit_answer import Actor, SubmitAnswerCommand
from ci_agent.bootstrap.container import Container
from ci_agent.domain.models.human import AnswerDecision
from ci_agent.domain.models.notification import ChannelType, Role
from ci_agent.infrastructure.notifications.telegram import parse_callback_data
from ci_agent.interfaces.http.dependencies import get_container

router = APIRouter(prefix="/webhooks/telegram", tags=["webhooks"])

_DECISION_FOR_CHOICE = {"reject": AnswerDecision.REJECT, "clarify": AnswerDecision.CLARIFY}


@router.post("")
async def telegram_webhook(request: Request, container: Container = Depends(get_container),
                           x_telegram_bot_api_secret_token: str = Header(default="")):
    expected = container.settings.telegram_webhook_secret
    # No configured secret means nothing can be verified, so every update is refused.
    if not expected or not hmac.compare_digest(x_telegram_bot_api_secret_token.encode(), expected.encode()):
        raise HTTPException(401, "Invalid webhook secret")

    body = await request.json()
    callback = body.get("callback_query")
    if not callback:
        return {"ok": True}  # ignore updates we don't care about (e.g. plain text messages)

    parsed = parse_callback_data(callback.get("data", ""))
    if parsed is None:
        return {"ok": True}
    question_id, choice = parsed

    chat_id = str(callback["from"]["id"])
    recipient = container.workflow.directory.resolve_identity(ChannelType.TELEGRAM, chat_id)
    if recipient is None:
        return {"ok": True}  # unknown chat id: silently ignore rather than leaking info

    decision = _DECISION_FOR_CHOICE.get(choice, AnswerDecision.APPROVE)
    option_id = None if decision is not AnswerDecision.APPROVE else choice
    actor = Actor(user_id=recipient.user_id, role=recipient.role, channel="telegram")
    try:
        container.workflow.coordinator.submit_answer(
            SubmitAnswerCommand(question_id, decision, actor, option_id))
    except ApplicationError:
        pass  # question may already be closed; Telegram does not need an error response
    return {"ok": True}
