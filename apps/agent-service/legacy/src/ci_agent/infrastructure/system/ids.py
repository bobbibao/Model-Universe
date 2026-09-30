from __future__ import annotations

from uuid import uuid4


class UuidGenerator:
    def new_id(self) -> str:
        return str(uuid4())


class SequentialIds:
    """Deterministic ids for tests: id-1, id-2, ..."""

    def __init__(self, prefix: str = "id") -> None:
        self._prefix, self._n = prefix, 0

    def new_id(self) -> str:
        self._n += 1
        return f"{self._prefix}-{self._n}"
