from __future__ import annotations

import re
from pathlib import Path

from ci_agent.application.ports.knowledge import SopSnippet


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


class InMemorySopKnowledge:
    """Keyword-overlap SOP search. Replace with pgvector for semantic retrieval (ROADMAP T-06)."""

    def __init__(self, snippets: list[SopSnippet]) -> None:
        self._snippets = snippets

    @classmethod
    def from_directory(cls, directory: Path) -> "InMemorySopKnowledge":
        snippets = []
        for path in sorted(directory.glob("*.md")):
            text = path.read_text(encoding="utf-8")
            title = text.splitlines()[0].lstrip("# ").strip() if text else path.stem
            sop_id = title.split(":")[0].strip() or path.stem
            snippets.append(SopSnippet(sop_id, title, text))
        return cls(snippets)

    def search_sop(self, query: str, limit: int = 3) -> list[SopSnippet]:
        q = _tokens(query)
        scored = sorted(((len(q & _tokens(s.title + " " + s.text)), s) for s in self._snippets),
                        key=lambda pair: pair[0], reverse=True)
        return [s for score, s in scored[:limit] if score > 0]
