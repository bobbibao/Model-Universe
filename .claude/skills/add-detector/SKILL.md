---
name: add-detector
description: Add a deterministic detector that turns shop or market data into an Opportunity (e.g. slow-moving stock, a competitor undercut, a trend spike) so the monitor opens an improvement thread for it. Use when asked to detect a new kind of situation.
---

Paths are relative to `apps/agent-service/`. Example: `src/shop_agent/domain/detectors/dead_stock.py`.

1. Detector: a class in `src/shop_agent/domain/detectors/` (growth, from Phase 7: `domain/growth/detectors/`) with a
   `kind` and `detect(snapshot, now) -> list[Opportunity]`. Pure: no I/O, deterministic for the same snapshot, money
   in whole VND, thresholds as constructor defaults (growth: `data/growth/defaults.yaml`). Titles and summaries are
   Vietnamese (they are shown to people); evidence values are numbers the domain computed.
2. Fingerprint: `make_fingerprint(kind, scope, bucket)` - the same situation must give the same fingerprint (the
   monitor's thread id is `uuid5(fingerprint)`), and a new period that should open a new thread gets a new bucket.
3. Register it in `default_detectors()` (`domain/detectors/base.py`). The monitor only opens threads for kinds that
   have a `KindSpec`, so register the kind in `src/shop_agent/agents/kinds.py`: playbook (`add-playbook`), read and
   estimator tools, allowed action types, `validate` (usually `domain.options.plan_option` plus strategies in
   `domain/options.py`), measurement plan (`domain/measurement.py`) and risk tier (`domain/policies/tiers.py`).
4. Scripted answers for the new kind: `src/shop_agent/testing/scripts/improvement.yaml`
   (`improvement.investigate.<kind>`), or the graph tests and `simulate` fail with "no scripted answers".
5. Tests: `tests/unit/domain/test_detectors.py` (one case that triggers, one boundary that does not, fingerprint
   stability); a graph test in `tests/graphs/` if the kind has new options; an eval scenario (`run-evals`).
   Gate: `uv run poe check` and `uv run shop-agent simulate loop --auto-approve --assert`.
