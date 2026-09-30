"""An ActionSpec body IS the Agent API request body: every action the agent can build is accepted by the OpenAPI
contract (through the validating web double), and what the domain refuses the contract refuses too."""

from __future__ import annotations

from typing import Any

import pytest
import yaml

from shop_agent.adapters.shop_api import AgentApiWriter
from shop_agent.domain.actions import ACTIONS, ActionSpec
from tests.support.factories import SAMPLE_BODIES
from tests.support.web_double import BASE_PATH, HOST, SPEC, TOKEN, WebDouble

PATHS: dict[str, Any] = yaml.safe_load(SPEC.read_text("utf-8"))["paths"]


def _writer(double: WebDouble) -> AgentApiWriter:
    return AgentApiWriter(f"{HOST}{BASE_PATH}", TOKEN, client=double.client())


def _spec(action_type: str, body: dict[str, Any], key: str = "k1") -> ActionSpec:
    return ActionSpec(action_id="a1", type=action_type, body=body, idempotency_key=key)


@pytest.mark.parametrize("action_type", sorted(ACTIONS))
async def test_every_action_body_is_accepted_by_the_contract(action_type: str) -> None:
    double = WebDouble()
    result = await _writer(double).execute(_spec(action_type, dict(SAMPLE_BODIES[action_type])))
    assert result.ok, result.detail
    [applied] = double.applied
    assert applied.endpoint == ACTIONS[action_type].endpoint and applied.body == SAMPLE_BODIES[action_type]


@pytest.mark.parametrize("action_type", sorted(ACTIONS))
def test_body_models_mirror_the_request_schemas(action_type: str) -> None:
    definition = ACTIONS[action_type]
    schema = PATHS[f"/{definition.endpoint}"]["post"]["requestBody"]["content"]["application/json"]["schema"]
    properties = set(schema["properties"]) - {"dry_run"}
    assert set(definition.body_model.model_fields) == properties
    required = {n for n, f in definition.body_model.model_fields.items() if f.is_required()}
    assert required == set(schema.get("required", []))


@pytest.mark.parametrize(
    ("action_type", "body"),
    [
        ("apply_discount", {"skus": ["A"], "percent": 95, "duration_days": 7}),
        ("apply_discount", {"skus": [], "percent": 20, "duration_days": 7}),
        ("apply_discount", {"skus": ["A"], "percent": 20, "duration_days": 91}),
        ("adjust_inventory", {"sku": "A", "new_status": "sold"}),
        ("switch_channel", {"skus": ["A"], "to_channel": "marketplace"}),
        ("update_sop_checklist", {"sop_id": "SOP-001", "add_items": []}),
    ],
)
async def test_what_the_domain_refuses_the_contract_refuses(action_type: str, body: dict[str, Any]) -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        ACTIONS[action_type].body_model.model_validate(body)
    result = await _writer(WebDouble()).execute(_spec(action_type, body))
    assert (result.ok, result.status_code) == (False, 400)


async def test_idempotency_and_revert_follow_the_contract() -> None:
    double = WebDouble()
    writer = _writer(double)
    spec = _spec("apply_discount", dict(SAMPLE_BODIES["apply_discount"]))
    first, replay = await writer.execute(spec), await writer.execute(spec)
    assert first == replay and len(double.applied) == 1
    edited = spec.model_copy(update={"body": {**spec.body, "percent": 25.0}})
    assert (await writer.execute(edited)).status_code == 409
    assert (await writer.revert(spec.idempotency_key, idempotency_key=f"{spec.idempotency_key}:revert")).ok
    assert double.reverted == [spec.idempotency_key]


async def test_a_wrong_token_is_refused() -> None:
    double = WebDouble()
    result = await AgentApiWriter(f"{HOST}{BASE_PATH}", "wrong", client=double.client()).execute(
        _spec("create_task", dict(SAMPLE_BODIES["create_task"]))
    )
    assert result.status_code == 401 and double.applied == []
