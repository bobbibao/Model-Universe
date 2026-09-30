"""Keyword-overlap ranking of past cases, shared by the in-memory and Postgres case memories so both answer the same.
Replaced by vector search in ROADMAP T-06."""
from __future__ import annotations

import re
from collections.abc import Iterable

from ci_agent.domain.models.case import CaseRecord


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def rank_similar(cases: Iterable[CaseRecord], text: str, signal_kind: str | None, limit: int) -> list[CaseRecord]:
    """`cases` in insertion order; ties keep that order."""
    query = _tokens(text)
    scored = [(len(query & _tokens(c.situation + " " + c.signal_kind)), c) for c in cases
              if not signal_kind or c.signal_kind == signal_kind]
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [c for _, c in scored[:limit]]
