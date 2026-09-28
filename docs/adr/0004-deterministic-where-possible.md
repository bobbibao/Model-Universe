# ADR-0004: Deterministic where possible, LLM only where necessary

Detect, Act and Measure are plain code (SQL/rules/arithmetic). Investigate uses the reasoner to
explain causes and reference SOPs. Improve's numbers come from `domain/strategies/*`; the
reasoner only ranks and explains them (see `application/use_cases/investigate.py::rank_options`).
Ask's question text and Learn's lessons use the reasoner to write prose.

**Why:** cheaper, testable without an LLM (see `RuleBasedReasoner`, the default in every test),
and money/inventory numbers are never invented by a model.
