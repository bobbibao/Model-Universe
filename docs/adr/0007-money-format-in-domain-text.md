# ADR-0007: Formatting-only exception for money in domain text

**Context:** since T-03b the domain computes amounts in an internal money unit (`MONEY_UNIT_VND` VND per
unit), and the HTTP layer converts them to VND. Agent-written text still printed internal units, and four of
the five places that write amounts into text are in `domain/`: the dead-stock signal summary, the measurement
summary, guardrail messages and strategy assumptions (the fifth, question option lines, is in `application/`).
A formatting port could not reach the guardrail messages or the assumptions, and would have left two versions
of the same text (stored vs displayed), including in what the T-01 reasoner reads.

**Decision (granted by the owner for ROADMAP T-03c, exactly):** "domain/ may gain a MoneyFormat value object and
accept it as an optional parameter where text is built. No change to rules, thresholds, constants or computed
numbers. Defaults reproduce today's text."

- `domain/models/money.py::MoneyFormat` is pure Python with no imports. `MoneyFormat()` writes the historical
  text; `MoneyFormat(unit_vnd)` writes VND ("1.072.290.000 ₫").
- It is accepted, always optionally and with that default, by: `DeadStockDetector` (via `default_detectors`),
  `measurement_evaluator.evaluate`, `PlanWithinDirective`, `MaxPlanCost` (via `default_engine`),
  `StrategyContext` (for `donate`, `repackage`, `bundle` assumptions), and in `application/`:
  `NotificationFactory`, `InvestigateImprovement`, `PlanImprovement`, `MeasureOutcome`.
- Wiring: `WorkflowOptions.money`; `bootstrap/container.py` sets `MoneyFormat(settings.money_unit_vnd)`. The
  demo world and tests keep the default.
- One visible correction was part of the grant: the default no longer writes currency KPIs in scientific
  notation ("1.23457e+06" is now "1234567"); every other default text is byte-identical (tests pin it).

**Consequences:** the stored text (signal and measurement summaries, cases, events, notification bodies on all
channels) is VND wherever a person or the reasoner reads it. Known side effect, not a rule change: the signal
summary also feeds keyword retrieval (the SOP search query in `investigate.py` and a case's `situation`), so the
changed number tokens can shift which past cases count as "similar" slightly; this goes away with the vector search
of ROADMAP T-06. The exception covers formatting only: a new domain
change that alters a rule, a threshold, a constant or a computed number, or uses MoneyFormat to compute
anything, is outside it and needs its own decision.
