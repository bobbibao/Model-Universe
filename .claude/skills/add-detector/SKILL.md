---
name: add-detector
description: Add a new Detect-phase rule that turns raw shop data into a Signal (e.g. detecting slow-moving categories, supplier quality issues, seasonal overstock). Use when asked to detect a new kind of operational problem.
---

1. Create `apps/agent-service/src/ci_agent/domain/detectors/<name>.py`.
2. Subclass `Detector` (`domain/detectors/base.py`): set `kind` (a short slug used everywhere -
   signals, cases, measurement plans) and implement `detect(snapshot, now) -> list[Signal]`.
   Must be pure - no I/O, deterministic given the same `ShopSnapshot`.
3. Use `make_fingerprint(kind, skus)` for `Signal.fingerprint` - it drives the cooldown that
   stops the same issue from being re-detected every tick.
4. Decorate with `@register_detector`, import the module from `domain/detectors/__init__.py`.
5. Add a `MeasurementPlan` entry for the new kind in `domain/strategies/_common.py`'s
   `_MEASUREMENT` dict if strategies will act on it.
6. At least one `ImprovementStrategy.applies_to` should return `True` for the new kind, or the
   Investigate phase will dismiss every improvement of this kind as non-actionable.
7. Add a unit test in `tests/unit/domain/` with a small hand-built `ShopSnapshot` (see
   `test_strategies_and_measurement.py::_snapshot`) covering: a case that should trigger, and
   a boundary case that should not.
