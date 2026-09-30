---
name: add-detector
description: Add a deterministic detector that turns shop or market data into an Opportunity (e.g. slow-moving stock, a competitor undercut, a trend spike) so the monitor opens an improvement thread for it. Use when asked to detect a new kind of situation.
---

Status: stub; finished in Phase 3 when the first detectors exist.

1. Add a pure function or class in `src/shop_agent/domain/detectors/` (growth: `domain/growth/detectors/`): snapshot in,
   `list[Opportunity]` out, no I/O. Thresholds live in `data/growth/defaults.yaml` or constructor defaults, in VND.
2. Fingerprint = kind + scope + period bucket, so the same situation never opens two threads.
3. Register the kind in `agents/kinds.py` (`KindSpec`: playbook, tools, validate, measurement, risk tier).
4. Unit tests in `tests/unit/`: one case that triggers, one boundary case that does not.
