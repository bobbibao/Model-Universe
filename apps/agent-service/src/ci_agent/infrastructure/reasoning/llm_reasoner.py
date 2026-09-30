"""LlmReasoner: the LLM-backed ReasoningPort (ROADMAP T-01, docs/adr/0008-llm-reasoner.md).

Provider-neutral: prompts, the facts shown, output validation and the fallback live here; only the `LlmClient`
differs (Ollama or Claude, see llm_clients.py). Guarantees, by construction rather than by prompt:

- No tools and no write path: a client call is one message in, one JSON object out, and this package imports
  nothing that can write (tests/unit/infrastructure/test_llm_reasoner.py checks the imports).
- No numbers that drive anything: the output schemas have no amount, price or quantity; any number in the prose
  must appear in the facts shown (`invented_numbers`), otherwise the output is rejected.
- The LLM cannot dismiss an improvement: `actionable` always comes from the rules. Ask still blocks.
- Every failure (timeout, unreachable, refusal, invalid output, unknown SOP id, invented number, busy, budget)
  falls back to `RuleBasedReasoner` for that call and is logged with its reason; configuration errors (bad model
  id, bad key, bad parameter, model not pulled) at ERROR so they cannot hide behind the fallback.
- The Claude daily budget is kept in the agent database (T-02), so a restart does not reset it.
- One LLM call at a time; after a timeout or an unreachable provider, calls pause for a cool-down so a run over
  many improvements degrades to rules quickly instead of waiting on every call.
"""
from __future__ import annotations

import logging
import threading
import time
from collections import Counter
from collections.abc import Callable
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Protocol, TypeVar

from pydantic import BaseModel

from ci_agent.application.ports.reasoning import (
    FindingDraft,
    InvestigationContext,
    LessonInput,
    QuestionText,
)
from ci_agent.domain.models.finding import Cause, Finding
from ci_agent.domain.models.money import MoneyFormat
from ci_agent.domain.models.signal import Signal
from ci_agent.infrastructure.reasoning.llm_clients import (
    CONFIG,
    INVALID_OUTPUT,
    TRANSIENT,
    LlmClient,
    LlmError,
)
from ci_agent.infrastructure.reasoning.llm_facts import (
    COMPOSE_QUESTION,
    EXTRACT_LESSONS,
    INVESTIGATE,
    SMALL_MODEL,
    PromptLimits,
    invented_numbers,
    investigation_facts,
    lesson_facts,
    question_facts,
    question_problem,
    shown_sop,
)
from ci_agent.infrastructure.reasoning.llm_schemas import (
    InvestigationOut,
    LessonsOut,
    QuestionOut,
)
from ci_agent.infrastructure.reasoning.rule_based import RuleBasedReasoner

logger = logging.getLogger(__name__)

PROMPTS = Path(__file__).resolve().parent / "prompts"
PROMPT_FILES = {INVESTIGATE: "investigate", COMPOSE_QUESTION: "compose_question", EXTRACT_LESSONS: "lessons"}
BUDGET, PAUSED, BUSY = "budget", "paused", "busy"

M = TypeVar("M", bound=BaseModel)


def load_prompt(name: str) -> str:
    text = (PROMPTS / f"{name}.md").read_text(encoding="utf-8").strip()
    return text.split("\n", 1)[1].strip() if text.startswith("# ") else text  # the heading is for readers only


class SpendStore(Protocol):
    """USD spent on the LLM per UTC day. Postgres in a deployment (persistence/postgres/stores.py::PostgresLlmSpend),
    so a restart does not reset the budget; in memory for tests and the demo."""

    def spent_usd(self, day: date) -> float: ...

    def add_usd(self, day: date, usd: float) -> None: ...


class InMemorySpendStore:
    def __init__(self) -> None:
        self._spent: dict[date, float] = {}

    def spent_usd(self, day: date) -> float:
        return self._spent.get(day, 0.0)

    def add_usd(self, day: date, usd: float) -> None:
        self._spent[day] = self._spent.get(day, 0.0) + usd


class DailyBudget:
    """At most `limit_usd` per UTC day. If the spend cannot be read, the budget counts as spent (fail closed: the rules
    answer rather than risk unbounded cost)."""

    def __init__(self, limit_usd: float, today: Callable[[], date], store: SpendStore) -> None:
        self.limit_usd, self._today, self._store = limit_usd, today, store

    def exhausted(self) -> bool:
        try:
            return self._store.spent_usd(self._today()) >= self.limit_usd
        except Exception as exc:  # noqa: BLE001 - any store failure fails closed
            logger.warning("LLM spend could not be read (%s); treating the daily budget as spent", exc)
            return True

    def add(self, usd: float) -> None:
        try:
            self._store.add_usd(self._today(), usd)
        except Exception as exc:  # noqa: BLE001 - a lost record must not fail the reasoning
            logger.warning("LLM spend of $%.4f could not be recorded (%s)", usd, exc)


class LlmReasoner:
    def __init__(self, client: LlmClient, money: MoneyFormat | None = None, limits: PromptLimits = SMALL_MODEL,
                 daily_budget_usd: float | None = None, cooldown_s: float = 60.0, lock_wait_s: float = 60.0,
                 monotonic: Callable[[], float] = time.monotonic,
                 today: Callable[[], date] = lambda: datetime.now(UTC).date(),
                 spend_store: SpendStore | None = None) -> None:
        self._client, self._money, self._limits = client, money or MoneyFormat(), limits
        self._rules = RuleBasedReasoner()
        self._budget = (DailyBudget(daily_budget_usd, today, spend_store or InMemorySpendStore())
                        if daily_budget_usd is not None else None)
        self._cooldown_s, self._lock_wait_s, self._monotonic = cooldown_s, lock_wait_s, monotonic
        self._lock, self._paused_until = threading.Lock(), 0.0
        self._system = {method: load_prompt("system") + "\n\n" + load_prompt(name)
                        for method, name in PROMPT_FILES.items()}
        self.stats: Counter[str] = Counter()  # "<method>:llm" or "<method>:fallback:<reason>"

    def check(self) -> None:
        self._client.check()

    # --------------------------------------------------------------------------------------- ReasoningPort
    def investigate(self, ctx: InvestigationContext) -> FindingDraft:
        rules = self._rules.investigate(ctx)
        facts = investigation_facts(ctx, self._money, self._limits)
        allowed = {s.id for s in shown_sop(ctx, self._limits)}

        def problems(out: InvestigationOut) -> str | None:
            unknown = sorted(set(out.sop_refs) - allowed)
            if unknown:
                return f"unknown SOP ids {unknown}"
            return _invented(" ".join(c.text for c in out.causes), facts)

        out = self._call(INVESTIGATE, facts, InvestigationOut, problems)
        if out is None:
            return rules
        evidence = {"source": "llm", "provider": self._client.provider, "model": self._client.model}
        return FindingDraft(summary=rules.summary,
                            causes=tuple(Cause(c.text.strip(), round(c.confidence, 2), dict(evidence))
                                         for c in out.causes),
                            sop_refs=tuple(dict.fromkeys(out.sop_refs)),
                            actionable=rules.actionable,  # never the LLM's call: it cannot dismiss an improvement
                            confidence=round(out.confidence, 2))

    def compose_question(self, signal: Signal, finding: Finding, note: str | None = None) -> QuestionText:
        rules = self._rules.compose_question(signal, finding, note)
        facts = question_facts(signal, finding, note)
        out = self._call(COMPOSE_QUESTION, facts, QuestionOut,
                         lambda o: question_problem(o.prompt) or _invented(o.prompt, facts))
        # The context (causes, SOPs and any guardrail note) stays the rules' text, so a re-ask reason is never
        # paraphrased away.
        return QuestionText(out.prompt.strip(), rules.context) if out is not None else rules

    def extract_lessons(self, lesson_input: LessonInput) -> list[str]:
        rules = self._rules.extract_lessons(lesson_input)
        facts = lesson_facts(lesson_input, self._limits)
        out = self._call(EXTRACT_LESSONS, facts, LessonsOut, lambda o: _invented(" ".join(o.lessons), facts))
        return [lesson.strip() for lesson in out.lessons] if out is not None else rules

    # ------------------------------------------------------------------------------------------ internals
    def _call(self, method: str, facts: str, schema: type[M], problems: Callable[[M], str | None]) -> M | None:
        started = self._monotonic()
        if self._budget is not None and self._budget.exhausted():
            self._fallback(method, BUDGET, f"daily LLM budget of ${self._budget.limit_usd:.2f} is spent",
                                  started)
            return None
        if started < self._paused_until:
            self._fallback(method, PAUSED, "cooling down after a provider failure", started)
            return None
        if not self._lock.acquire(timeout=self._lock_wait_s):
            self._fallback(method, BUSY, "another LLM call is still running", started)
            return None
        try:
            try:
                reply = self._client.complete(self._system[method], facts, schema, self._limits.max_tokens[method])
            finally:
                self._lock.release()
        except LlmError as exc:
            if exc.kind in TRANSIENT:
                self._paused_until = self._monotonic() + self._cooldown_s
            self._fallback(method, exc.kind, exc.detail, started)
            return None
        cost = self._client.cost_usd(reply)
        if self._budget is not None:
            self._budget.add(cost)
        output = reply.output
        assert isinstance(output, schema)
        problem = problems(output)
        if problem:
            self._fallback(method, INVALID_OUTPUT, problem, started)
            return None
        self.stats[f"{method}:llm"] += 1
        logger.info("LLM %s: %s %s answered in %.1fs (%d input / %d output tokens, $%.4f)", method,
                    self._client.provider, self._client.model, self._monotonic() - started, reply.input_tokens,
                    reply.output_tokens, cost)
        return output

    def _fallback(self, method: str, reason: str, detail: str, started: float) -> None:
        self.stats[f"{method}:fallback:{reason}"] += 1
        if reason == CONFIG:
            logger.error("LLM configuration error in %s (%s %s): %s. Fix the LLM settings; the rule-based reasoner "
                         "answers meanwhile.", method, self._client.provider, self._client.model, detail)
        else:
            logger.warning("LLM %s fell back to rules after %.1fs: %s (%s) [%s %s]", method,
                           self._monotonic() - started, reason, detail, self._client.provider, self._client.model)


def _invented(text: str, facts: str) -> str | None:
    invented = invented_numbers(text, facts)
    return f"numbers not in the facts: {', '.join(invented[:5])}" if invented else None
