from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ci_agent.domain.models.notification import ChannelType, Recipient, Role, ROLE_RANK, role_at_least


class StaticRecipientDirectory:
    """Recipient directory from static config. Replace with the web app's user table later (ROADMAP T-08)."""

    def __init__(self, recipients: list[Recipient]) -> None:
        self._recipients = list(recipients)

    @classmethod
    def from_dicts(cls, items: list[dict[str, Any]]) -> "StaticRecipientDirectory":
        recipients = []
        for it in items:
            recipients.append(Recipient(
                user_id=it["user_id"], name=it.get("name", it["user_id"]), role=Role(it.get("role", "staff")),
                handles={ChannelType(k): str(v) for k, v in it.get("handles", {}).items()},
                preferred_channels=tuple(ChannelType(c) for c in it.get("preferred_channels", ["web"]))))
        return cls(recipients)

    @classmethod
    def from_json_file(cls, path: Path) -> "StaticRecipientDirectory":
        return cls.from_dicts(json.loads(path.read_text(encoding="utf-8")))

    def get(self, user_id: str) -> Recipient | None:
        return next((r for r in self._recipients if r.user_id == user_id), None)

    def approvers_for(self, minimum_role: Role) -> list[Recipient]:
        return sorted((r for r in self._recipients if role_at_least(r.role, minimum_role)),
                      key=lambda r: ROLE_RANK[r.role])

    def admins(self) -> list[Recipient]:
        return [r for r in self._recipients if role_at_least(r.role, Role.MANAGER)]

    def resolve_identity(self, channel: ChannelType, external_id: str) -> Recipient | None:
        return next((r for r in self._recipients if r.handles.get(channel) == external_id), None)
