"""The facts an LLM call sees, rendered as text, and the check that its prose invents no number.

Everything shop-, SOP-, case- or human-supplied is data inside a <facts> block: angle brackets are removed from it
so it cannot close the block, whitespace is collapsed and long strings are cut. Amounts are written with the same
MoneyFormat as every other agent-written text (VND in a real deployment, ADR-0007). Every number shown here is
read from the context or counted from it; none comes from an LLM.
"""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field

from ci_agent.application.ports.knowledge import SopSnippet
from ci_agent.application.ports.reasoning import InvestigationContext, LessonInput
from ci_agent.domain.models.finding import Finding
from ci_agent.domain.models.money import MoneyFormat
from ci_agent.domain.models.signal import Signal

INVESTIGATE, COMPOSE_QUESTION, EXTRACT_LESSONS = "investigate", "compose_question", "extract_lessons"


@dataclass(frozen=True)
class PromptLimits:
    """How much context a model gets, and its output-token cap per method."""

    max_items: int
    max_sop: int
    sop_chars: int
    max_cases: int
    max_notes: int
    max_tokens: dict[str, int] = field(default_factory=dict)


# A small local model: fewer SOP excerpts, only the top similar case, tight output caps.
SMALL_MODEL = PromptLimits(max_items=10, max_sop=1, sop_chars=1200, max_cases=1, max_notes=2,
                           max_tokens={INVESTIGATE: 320, COMPOSE_QUESTION: 220, EXTRACT_LESSONS: 180})
# A hosted model: more context; the output cap leaves room for adaptive thinking.
LARGE_MODEL = PromptLimits(max_items=25, max_sop=3, sop_chars=2500, max_cases=3, max_notes=5,
                           max_tokens={INVESTIGATE: 2048, COMPOSE_QUESTION: 2048, EXTRACT_LESSONS: 2048})


def clean(text: str, limit: int = 300) -> str:
    text = " ".join(text.replace("<", " ").replace(">", " ").split())
    return text if len(text) <= limit else text[: limit - 3].rstrip() + "..."


def _facts(lines: list[str]) -> str:
    return "<facts>\n" + "\n".join(lines) + "\n</facts>"


def shown_sop(ctx: InvestigationContext, limits: PromptLimits) -> tuple[SopSnippet, ...]:
    return ctx.sop[: limits.max_sop]


def investigation_facts(ctx: InvestigationContext, money: MoneyFormat, limits: PromptLimits) -> str:
    signal = ctx.signal
    lines = [f"Signal: {signal.kind}, severity {signal.severity.value}",
             f"Detector summary: {clean(signal.summary)}"]
    items = sorted(ctx.items, key=lambda i: (-i.quantity, i.sku))[: limits.max_items]
    lines.append(f"Affected items: {len(ctx.items)}")
    if ctx.items:
        # Counted over every affected item (not just the listed ones), so a small model sees the pattern.
        categories = Counter(i.category for i in ctx.items).most_common(5)
        lines.append("- by category: " + ", ".join(f"{clean(c, 40)} {n}" for c, n in categories))
        days = [i.days_in_stock for i in ctx.items]
        sold_total = sum(round(ctx.velocity.get(i.sku, 0.0) * 30) for i in ctx.items)
        lines.append(f"- days in stock: {min(days)} to {max(days)}; units sold in the last 30 days, all affected "
                     f"items together: {sold_total}")
    if len(items) < len(ctx.items):
        lines.append(f"The {len(items)} affected items with the most units in stock:")
    for item in items:
        sold = round(ctx.velocity.get(item.sku, 0.0) * 30)
        expiry = f", expires {item.expiry_date.isoformat()}" if item.expiry_date else ""
        lines.append(f"- SKU {clean(item.sku, 40)} \"{clean(item.name, 90)}\", category {clean(item.category, 40)}: "
                     f"{item.quantity} in stock for {item.days_in_stock} days, {sold} sold in the last 30 days, "
                     f"unit cost {money.text(item.unit_cost, '.2f')}, price {money.text(item.unit_price, '.2f')}, "
                     f"channel {clean(item.channel, 20)}, condition {clean(item.condition, 20)}{expiry}")
    if ctx.returns:
        total = len(ctx.returns)
        lines.append(f"Returns of these items: {total}")
        for reason, n in Counter(r.reason for r in ctx.returns).most_common():
            lines.append(f"- reason {clean(reason, 40)}: {n} of {total} ({round(100 * n / total)}%)")
        conditions = Counter(r.condition for r in ctx.returns).most_common()
        lines.append("- condition on arrival: " + ", ".join(f"{clean(c, 20)} {n}" for c, n in conditions))
        per_sku = Counter(r.sku for r in ctx.returns).most_common(limits.max_items)
        lines.append("- returns per SKU: " + ", ".join(f"{clean(s, 40)} {n}" for s, n in per_sku))
    sop = shown_sop(ctx, limits)
    lines.append("Allowed SOP ids for sop_refs: " + (", ".join(s.id for s in sop) if sop else "none (leave it empty)"))
    lines += [f"<sop id=\"{clean(s.id, 40)}\">{clean(s.text, limits.sop_chars)}</sop>" for s in sop]
    for case in ctx.similar_cases[: limits.max_cases]:
        verdict = case.outcome_verdict or "nothing executed"
        lines.append(f"<past_case decision=\"{clean(case.decision, 60)}\" outcome=\"{verdict}\">"
                     f"{clean(case.situation, 400)} Lessons: {clean(' '.join(case.lessons), 400)}</past_case>")
    lines += [f"The owner asked or noted (answer it in the first cause): <admin_note>{clean(note, 300)}</admin_note>"
              for note in ctx.human_notes[-limits.max_notes:]]
    return _facts(lines)


def question_facts(signal: Signal, finding: Finding, note: str | None) -> str:
    lines = [f"Signal: {signal.kind}, severity {signal.severity.value}",
             f"Detector summary: {clean(signal.summary)}", "Findings:"]
    lines += [f"- {clean(c.description)} (confidence {round(c.confidence * 100)}%)" for c in finding.causes]
    if finding.sop_refs:
        lines.append("SOPs that apply: " + ", ".join(clean(s, 40) for s in finding.sop_refs))
    # Only the count: the options and their amounts are in the table next to the text, never paraphrased.
    lines.append(f"Options in the table below the text: {len(finding.options)}, the first one recommended")
    if note:
        lines.append(f"<note>{clean(note, 400)}</note>")
    return _facts(lines)


def lesson_facts(lesson: LessonInput, limits: PromptLimits) -> str:
    parts = lesson.decision.split(":")
    if parts[0] == "approved":
        decision = f"approved, strategy {parts[1] if len(parts) > 1 else 'unknown'}"
        decision += ", execution failed and was rolled back" if parts[-1] == "failed" else ""
    else:
        decision = clean(lesson.decision, 40)
    lines = [f"Signal kind: {lesson.signal_kind}", f"Decision: {decision}",
             f"Measured outcome: {lesson.outcome_verdict or 'none (nothing was executed)'}"]
    if lesson.kpi_summary:
        lines.append("KPI changes (positive = better):")
        lines += [f"- {name}: {value:+.1f}%" for name, value in lesson.kpi_summary.items()]
    lines += [f"<admin_note>{clean(note, 300)}</admin_note>" for note in lesson.human_notes[-limits.max_notes:]]
    return _facts(lines)


# --------------------------------------------------------------------------------------- invented numbers

_NUMBER = re.compile(r"\d+(?:[.,]\d+)*")
SMALL_COUNT = 10  # "two causes", "1 of 3": small counts are not facts worth checking
_FOREIGN_CURRENCY = re.compile(r"\$|\bUSD\b|\bdollars?\b", re.IGNORECASE)  # the shop's amounts are in VND
_OPTION = re.compile(r"\boptions?\b\s*[:#]?\s*\d", re.IGNORECASE)


def question_problem(prompt: str) -> str | None:
    """Options come only from strategies: a question text that lays out or names options is rejected."""
    if "\n" in prompt.strip():
        return "the question is not one paragraph"
    if _OPTION.search(prompt):
        return "the question describes an option"
    return None


def invented_numbers(text: str, facts: str) -> list[str]:
    """Numbers in `text` not written exactly so in `facts`, and any foreign currency sign.

    Exact, not just the same value: a regrouped or re-signed amount ("$1.072,290,000") misleads as much as an
    invented one, and the system prompt asks for numbers exactly as written.
    """
    known = set(_NUMBER.findall(facts))
    invented = [token for token in _NUMBER.findall(text)
                if token not in known and not (token.isdigit() and int(token) <= SMALL_COUNT)]
    return invented + _FOREIGN_CURRENCY.findall(text)
