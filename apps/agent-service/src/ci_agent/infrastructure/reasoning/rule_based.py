"""RuleBasedReasoner: deterministic ReasoningPort. Default for tests, demos and as an LLM fallback."""
from __future__ import annotations

from collections import Counter
from statistics import mean

from ci_agent.application.ports.reasoning import FindingDraft, InvestigationContext, LessonInput, QuestionText
from ci_agent.domain.models.finding import Cause, Finding
from ci_agent.domain.models.signal import Signal


class RuleBasedReasoner:
    def investigate(self, ctx: InvestigationContext) -> FindingDraft:
        kind, causes = ctx.signal.kind, []
        if kind == "dead_stock" and ctx.items:
            avg_v = mean(ctx.velocity.get(i.sku, 0.0) for i in ctx.items)
            avg_d = mean(i.days_in_stock for i in ctx.items)
            causes.append(Cause(f"Average sales velocity is {avg_v:.2f} units/day after {avg_d:.0f} days in stock",
                                0.8, {"avg_velocity": round(avg_v, 3), "avg_days_in_stock": round(avg_d, 1)}))
            top_cat, n = Counter(i.category for i in ctx.items).most_common(1)[0]
            if n / len(ctx.items) >= 0.5:
                causes.append(Cause(f"Stock is concentrated in the '{top_cat}' category", 0.6, {"category": top_cat}))
        elif kind == "high_returns" and ctx.returns:
            reason, n = Counter(r.reason for r in ctx.returns).most_common(1)[0]
            causes.append(Cause(f"Most frequent return reason: '{reason}' ({n} of {len(ctx.returns)})", 0.7,
                                {"reason": reason, "count": n}))
        elif kind == "near_expiry" and ctx.items:
            soonest = min((i.expiry_date for i in ctx.items if i.expiry_date), default=None)
            causes.append(Cause(f"{len(ctx.items)} SKUs approach expiry (earliest {soonest})", 0.9,
                                {"earliest_expiry": str(soonest)}))
        else:
            causes.append(Cause("Signal detected but evidence is thin", 0.3))
        summary = ctx.signal.summary
        if ctx.human_notes:
            summary += f" (human note: {ctx.human_notes[-1]})"
        return FindingDraft(summary=summary, causes=tuple(causes), sop_refs=tuple(s.id for s in ctx.sop),
                            actionable=bool(ctx.items), confidence=0.75 if ctx.items else 0.2)

    def compose_question(self, signal: Signal, finding: Finding, note: str | None = None) -> QuestionText:
        lines = [f"- {c.description}" for c in finding.causes]
        if finding.sop_refs:
            lines.append("- Relevant SOPs: " + ", ".join(finding.sop_refs))
        if finding.similar_case_ids:
            lines.append(f"- {len(finding.similar_case_ids)} similar past case(s) were considered")
        if note:
            lines.append(f"- Note: {note}")
        return QuestionText("Which approach should we take? You can adjust parameters when approving.",
                            "Why this matters:\n" + "\n".join(lines))

    def extract_lessons(self, li: LessonInput) -> list[str]:
        strategy = li.decision.split(":")[1] if li.decision.startswith("approved") and ":" in li.decision else None
        if li.decision == "rejected":
            return [f"A human rejected the proposal for {li.signal_kind}; check option relevance before asking again."]
        if li.decision == "expired":
            return ["No one answered in time; review notification routing or add an escalation contact."]
        if li.decision == "dismissed":
            return [f"The {li.signal_kind} signal had no viable option; consider tightening the detector threshold."]
        if li.decision.endswith(":failed"):
            return [f"Execution of '{strategy}' failed and was rolled back; check shop API availability."]
        best = max(li.kpi_summary.items(), key=lambda kv: kv[1], default=("kpi", 0.0))
        if li.outcome_verdict == "success":
            return [f"'{strategy}' worked for {li.signal_kind}: {best[0]} improved {best[1]:.0f}%."]
        if li.outcome_verdict == "negative":
            return [f"'{strategy}' made {li.signal_kind} worse; avoid it for similar cases."]
        return [f"'{strategy}' was inconclusive for {li.signal_kind}; extend the evaluation window or add data."]
