"""Guard: the invariant tests the plan names (section 5: Phase 3 task 3.7, Phase 7 and Phase 8 acceptance) exist, so
none disappears silently."""

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
    "tests.graphs.test_growth_improvement": [
        "test_low_tier_auto_promotion_runs_without_interrupt",
        "test_medium_tier_ad_interrupts",
        "test_first_platform_ad_interrupts_and_the_grant_is_forwarded",
        "test_shadow_mode_never_writes",
        "test_two_brand_failures_need_a_person_even_in_auto_mode",
    ],
    "tests.graphs.test_growth_monitor": [
        "test_roas_breach_pauses_without_a_model_call",
        "test_kill_switch_opens_no_growth_threads",
    ],
    "tests.graphs.test_assistant": [
        "test_a_write_tool_interrupts_and_nothing_runs",
        "test_an_edit_runs_the_edited_body_with_its_grant",
        "test_a_reject_runs_nothing",
        "test_subagents_have_no_write_tool_and_there_is_no_general_purpose_one",
        "test_a_memory_write_interrupts_and_lands_in_the_store_once_approved",
        "test_a_run_without_context_resolves_its_dependencies",
    ],
    "tests.unit.growth.test_growth_properties": [
        "test_prioritizer_never_exceeds_capacity",
        "test_policies_reject_over_caps",
        "test_tier_monotonic_in_spend",
        "test_claim_consistency_vi_formats",
        "test_measurement_did_known_answer",
        "test_update_priors_shrinkage",
    ],
}


def test_every_named_invariant_test_exists() -> None:
    missing = [
        f"{module}::{name}"
        for module, names in NAMED.items()
        for name in names
        if not callable(getattr(importlib.import_module(module), name, None))
    ]
    assert missing == []
