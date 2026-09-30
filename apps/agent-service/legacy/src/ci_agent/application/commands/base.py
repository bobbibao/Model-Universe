"""Command pattern for the Act phase.

Each planned action type maps to one small, idempotent command that can be
executed (optionally as a dry run) and compensated.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import ClassVar

from ci_agent.application.errors import ValidationFailed
from ci_agent.application.ports.shop import ActionResult, ShopActionPort
from ci_agent.domain.models.plan import PlannedAction


class ActionCommand(ABC):
    type: ClassVar[str]

    def __init__(self, action: PlannedAction) -> None:
        self.action = action

    @abstractmethod
    def execute(self, gateway: ShopActionPort, *, idempotency_key: str, dry_run: bool = False) -> ActionResult: ...

    def compensate(self, gateway: ShopActionPort, *, idempotency_key: str) -> ActionResult:
        return gateway.revert(idempotency_key=f"{idempotency_key}:revert", of_key=idempotency_key)


_COMMANDS: dict[str, type[ActionCommand]] = {}


def register_command(cls: type[ActionCommand]) -> type[ActionCommand]:
    _COMMANDS[cls.type] = cls
    return cls


def build_command(action: PlannedAction) -> ActionCommand:
    from ci_agent.application.commands import shop_commands  # noqa: F401  (registers built-ins)

    try:
        return _COMMANDS[action.type](action)
    except KeyError as exc:
        raise ValidationFailed(f"Unsupported action type: {action.type!r}") from exc
