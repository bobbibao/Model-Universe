"""Guard: the invariant tests the plan names (section 5, Phase 3, task 3.7) exist, so none disappears silently."""

import importlib

NAMED = {
    "tests.graphs.test_improvement": [
        "test_no_write_without_approval",
        "test_edit_runs_edited_body",
        "test_reject_runs_nothing",
        "test_respond_loops_to_investigate",
        "test_idempotent_retry_after_failure",
        "test_compensation_on_failed_step",
        "test_crash_after_baseline_resumes_without_duplicate",
        "test_reentry_measure_learn",
        "test_validate_discards_model_numbers",
        "test_auto_low_risk_skips_interrupt",
        "test_grant_replay_rejected",
    ],
    "tests.graphs.test_monitor": ["test_expiry_goes_to_learn", "test_dedupe_same_fingerprint"],
}


def test_every_named_invariant_test_exists() -> None:
    missing = [
        f"{module}::{name}"
        for module, names in NAMED.items()
        for name in names
        if not callable(getattr(importlib.import_module(module), name, None))
    ]
    assert missing == []
