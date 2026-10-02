"""The web's rules for agent writes, as packages/contracts/test-vectors/limits/requests.json pins them for both apps.

`evaluate` is what FakeShop answers with (and what `validate` checks options against), so a vector that passes here
is a request the simulated shop treats exactly like the web does.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from shop_agent.domain.growth.policies import ShopState, evaluate
from shop_agent.domain.growth.settings import GrowthSettings

VECTORS_DIR = Path(__file__).resolve().parents[4] / "packages/contracts/test-vectors"
DOC = json.loads((VECTORS_DIR / "limits/requests.json").read_text("utf-8"))
SETTING_DEFAULTS: dict[str, Any] = json.loads((VECTORS_DIR / "agent-settings.json").read_text("utf-8"))["defaults"]


def settings(overrides: dict[str, Any]) -> GrowthSettings:
    """The vectors' merge rule: by key, and one level deep for object values."""
    values = dict(SETTING_DEFAULTS)
    for key, value in overrides.items():
        values[key] = {**values[key], **value} if isinstance(value, dict) else value
    return GrowthSettings.from_values(values)


def state(vector: dict[str, Any]) -> ShopState:
    raw = {**DOC["base"], **vector["state"]}
    raw["settings"] = settings(raw.get("settings", {}))
    return ShopState.model_validate(raw)


@pytest.mark.parametrize("vector", DOC["vectors"], ids=lambda v: v["name"])
def test_limit_vector(vector: dict[str, Any]) -> None:
    verdict = evaluate(vector["endpoint"], vector["path"], vector["body"], state(vector), has_grant=vector["grant"])
    expect = vector["expect"]
    assert verdict.status == expect["status"], verdict.detail
    if expect["status"] != 200:
        assert verdict.code == expect["code"], verdict.detail
        if "reason" in expect:
            assert verdict.reason == expect["reason"], verdict.detail


def test_every_endpoint_with_rules_has_vectors() -> None:
    from shop_agent.domain.growth.policies import ROUTES

    covered = {v["endpoint"] for v in DOC["vectors"]}
    assert set(ROUTES) - covered <= {"sop/checklists"}, set(ROUTES) - covered
