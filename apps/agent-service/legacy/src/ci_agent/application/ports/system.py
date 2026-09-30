from __future__ import annotations

from datetime import datetime
from typing import Protocol


class ClockPort(Protocol):
    def now(self) -> datetime: ...


class IdGeneratorPort(Protocol):
    def new_id(self) -> str: ...


class TokenSignerPort(Protocol):
    def sign(self, payload: str) -> str: ...

    def verify(self, token: str) -> str | None:
        """Return the payload when the signature is valid, else None."""
