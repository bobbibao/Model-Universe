"""Zalo OA webhook (UNVERIFIED payload shape - see infrastructure/notifications/zalo.py docstring
and docs/ROADMAP.md T-05). Zalo's rich buttons are limited, so most replies arrive as free text
answered via the signed link (interfaces/http/routers uses the same SubmitAnswer use case);
this handler exists for the cases where a structured reply *is* available."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from ci_agent.application.errors import ApplicationError
from ci_agent.application.use_cases.submit_answer import Actor, SubmitAnswerCommand
from ci_agent.bootstrap.container import Container
from ci_agent.domain.models.human import AnswerDecision
from ci_agent.domain.models.notification import ChannelType
from ci_agent.interfaces.http.dependencies import get_container

router = APIRouter(prefix="/webhooks/zalo", tags=["webhooks"])


@router.post("")
async def zalo_webhook(request: Request, container: Container = Depends(get_container)):
    body = await request.json()
    sender_id = str(body.get("sender", {}).get("id", ""))
    text = str(body.get("message", {}).get("text", "")).strip().lower()
    if not sender_id or not text:
        return {"ok": True}

    recipient = container.workflow.directory.resolve_identity(ChannelType.ZALO, sender_id)
    imp = None
    if recipient is not None:
        for candidate in container.workflow.repo.list_by_status([__import__(
                "ci_agent.domain.models.improvement", fromlist=["ImprovementStatus"]).ImprovementStatus.AWAITING_HUMAN]):
            imp = candidate
            break
    if recipient is None or imp is None or imp.current_question is None:
        return {"ok": True}

    decision = AnswerDecision.APPROVE if text in ("1", "approve", "yes") else \
        AnswerDecision.REJECT if text in ("0", "reject", "no") else AnswerDecision.CLARIFY
    option_id = imp.current_question.recommended_option_id if decision is AnswerDecision.APPROVE else None
    actor = Actor(user_id=recipient.user_id, role=recipient.role, channel="zalo")
    try:
        container.workflow.coordinator.submit_answer(
            SubmitAnswerCommand(imp.current_question.id, decision, actor, option_id))
    except ApplicationError:
        pass
    return {"ok": True}
