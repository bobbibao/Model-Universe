"""Signed one-time-style links for answering from email/Zalo without a web session."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from ci_agent.application.ports.system import TokenSignerPort


@dataclass(frozen=True)
class LinkIdentity:
    question_id: str
    user_id: str


def resolve_link_token(signer: TokenSignerPort, token: str, now: datetime) -> LinkIdentity | None:
    payload = signer.verify(token)
    if payload is None:
        return None
    try:
        question_id, user_id, expires = payload.split("|")
        if now.timestamp() > int(expires):
            return None
    except ValueError:
        return None
    return LinkIdentity(question_id, user_id)
