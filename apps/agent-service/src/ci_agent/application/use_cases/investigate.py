"""Phase 2 - Investigate: gather evidence, reason about causes, preview candidate options.

The reasoner explains *why*; strategies compute *what could be done* with deterministic numbers.
Past cases feed forward: strategies that worked before rank higher, ones that failed rank lower.
"""
from __future__ import annotations

from dataclasses import replace
from typing import Callable, Sequence

from ci_agent.application.errors import NotFoundError
from ci_agent.application.ports.knowledge import CaseMemoryPort, KnowledgePort
from ci_agent.application.ports.reasoning import InvestigationContext, ReasoningPort
from ci_agent.application.ports.repositories import ImprovementRepository
from ci_agent.application.ports.shop import ShopReadPort
from ci_agent.application.ports.system import ClockPort
from ci_agent.application.services.recorder import Recorder
from ci_agent.domain.models.case import CaseRecord
from ci_agent.domain.models.finding import Finding, OptionPreview
from ci_agent.domain.models.improvement import ImprovementStatus
from ci_agent.domain.strategies.base import ImprovementStrategy, StrategyContext


def rank_options(previews: list[OptionPreview], cases: Sequence[CaseRecord]) -> list[OptionPreview]:
    good = {c.strategy for c in cases if c.strategy and c.outcome_verdict == "success"}
    bad = {c.strategy for c in cases if c.strategy and c.outcome_verdict == "negative"}

    def score(p: OptionPreview) -> float:
        s = p.net_value
        if p.strategy in good:
            s = s + abs(s) * 0.25 + 1
        if p.strategy in bad:
            s = s * 0.5 - 1
        return s

    annotated = []
    for p in previews:
        if p.strategy in good:
            p = replace(p, assumptions=p.assumptions + ("A similar past case succeeded with this strategy",))
        if p.strategy in bad:
            p = replace(p, assumptions=p.assumptions + ("A similar past case had a negative outcome with this strategy",))
        annotated.append(p)
    return sorted(annotated, key=score, reverse=True)


class InvestigateImprovement:
    def __init__(self, shop: ShopReadPort, knowledge: KnowledgePort, case_memory: CaseMemoryPort,
                 reasoner: ReasoningPort, strategies: Callable[[], list[ImprovementStrategy]],
                 repo: ImprovementRepository, recorder: Recorder, clock: ClockPort, max_options: int = 3) -> None:
        self._shop, self._knowledge, self._cases, self._reasoner = shop, knowledge, case_memory, reasoner
        self._strategies, self._repo, self._recorder, self._clock = strategies, repo, recorder, clock
        self._max_options = max_options

    def execute(self, improvement_id: str) -> None:
        imp = self._repo.get(improvement_id)
        if imp is None:
            raise NotFoundError(improvement_id)
        now = self._clock.now()
        if imp.status is ImprovementStatus.DETECTED:
            imp.start_investigation(now)

        snapshot = self._shop.snapshot()
        signal = imp.signal
        skus = set(signal.subject_skus)
        query = f"{signal.kind} {signal.summary}"
        sop = tuple(self._knowledge.search_sop(query))
        similar = tuple(self._cases.search_similar(query, signal.kind))
        ctx = InvestigationContext(
            signal=signal, items=tuple(snapshot.items(signal.subject_skus)),
            returns=tuple(r for r in snapshot.returns if r.sku in skus),
            velocity={s: snapshot.velocity(s) for s in signal.subject_skus},
            sop=sop, similar_cases=similar, human_notes=tuple(imp.human_notes))
        draft = self._reasoner.investigate(ctx)

        s_ctx = StrategyContext(snapshot=snapshot, now=now, sop_notes=tuple(s.text for s in sop))
        previews = [p for s in self._strategies() if s.applies_to(signal)
                    if (p := s.preview(signal, s_ctx)) is not None]
        options = tuple(rank_options(previews, similar)[: self._max_options])
        finding = Finding(signal_id=signal.id, summary=draft.summary, causes=draft.causes,
                          sop_refs=draft.sop_refs, similar_case_ids=tuple(c.id for c in similar),
                          options=options, actionable=draft.actionable and bool(options),
                          confidence=draft.confidence)
        imp.record_finding(finding, now)
        if not finding.actionable:
            imp.dismiss("no viable improvement option", now)
        self._recorder.commit(imp, "agent", "investigated",
                              {"actionable": finding.actionable, "options": [o.option_id for o in options]})
