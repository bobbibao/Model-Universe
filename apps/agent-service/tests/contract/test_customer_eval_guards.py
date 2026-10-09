"""Negative controls ensure the new customer quality gates can actually fail."""

import json
from typing import Any

import pytest
from evals.evaluators import (
    CaseOutput,
    check_customer_actions,
    check_customer_grounding,
    check_forbidden_text,
    check_language,
)
from evals.runner import gate
from langchain_core.messages import HumanMessage


@pytest.mark.parametrize("text", ["", "Đây là mô hình trong giỏ hàng của bạn.", "501 1450000"])
def test_english_gate_rejects_missing_or_wrong_language(text: str) -> None:
    result = check_language(CaseOutput(final_text=text), "en")
    assert not result.passed
    assert not result.skipped


def test_english_gate_accepts_readable_english() -> None:
    assert check_language(CaseOutput(final_text="This model is available in your cart."), "en").passed


@pytest.mark.parametrize(
    "decision",
    [
        {"productIds": [999]},
        {"actions": [{"kind": "cart_add", "productId": 999}]},
        {"reads": [{"kind": "orders"}]},
        {"actions": [{"kind": "navigate", "path": "/admin/orders"}]},
        {"actions": [{"kind": "navigate", "path": "//other.example"}]},
    ],
)
def test_customer_grounding_rejects_fabrication_or_disabled_reads(decision: dict[str, Any]) -> None:
    output = CaseOutput(
        messages=[HumanMessage(json.dumps({"catalog": [{"id": 501}], "readsAllowed": False}))],
        structured=decision,
    )
    assert not check_customer_grounding(output, True).passed


def test_action_gate_rejects_an_unrequested_write() -> None:
    output = CaseOutput(structured={"actions": [{"kind": "cart_clear"}]})
    assert not check_customer_actions(output, {"required": [], "allowed": []}).passed


def test_marketing_gate_rejects_an_injected_discount() -> None:
    assert not check_forbidden_text(CaseOutput(final_text="Save 99% today"), ["99%"]).passed


def test_marketing_gate_rejects_unsupported_availability_in_the_real_eval_dataset() -> None:
    from pathlib import Path

    import yaml

    cases = yaml.safe_load(Path("evals/suites/marketing/scenarios.yaml").read_text(encoding="utf-8"))
    english = next(case for case in cases if case["id"] == "facebook-en")
    actual_bad_copy = "Check out the new MG Gundam kit available on our platform!"
    assert not check_forbidden_text(CaseOutput(final_text=actual_bad_copy), english["expect"]["forbidden_text"]).passed


def test_critical_gate_fails_without_a_baseline() -> None:
    result = {"cases": [{"id": "ownership", "critical": True, "passed": False}], "pass_rate": 99.0}
    assert gate(result, None) == ["critical case failed: ownership"]
