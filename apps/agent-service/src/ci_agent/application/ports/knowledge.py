from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from ci_agent.domain.models.case import CaseRecord


@dataclass(frozen=True)
class SopSnippet:
    id: str
    title: str
    text: str


class KnowledgePort(Protocol):
    def search_sop(self, query: str, limit: int = 3) -> list[SopSnippet]: ...


class CaseMemoryPort(Protocol):
    def add(self, case: CaseRecord) -> None: ...

    def search_similar(self, text: str, signal_kind: str | None = None, limit: int = 3) -> list[CaseRecord]: ...

    def list_recent(self, limit: int = 50) -> list[CaseRecord]: ...
