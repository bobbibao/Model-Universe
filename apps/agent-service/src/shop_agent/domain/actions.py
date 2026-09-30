"""ActionSpec: one write, exactly as the web Agent API receives it (ADR-0011).

An action's `body` IS the request body of its endpoint (packages/contracts/openapi/web-agent-api.yaml, without
`dry_run`), so the approval grant can bind its hash. `validate` builds complete specs before review; `act` sends them
verbatim with their idempotency keys.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from shop_agent.domain.capabilities import Capability, WriteClass

Sku = str


class _Body(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DiscountBody(_Body):
    skus: list[Sku] = Field(min_length=1, max_length=500)
    percent: float = Field(gt=0, le=90)
    duration_days: int = Field(ge=1, le=90)


class InventoryAdjustmentBody(_Body):
    sku: Sku = Field(min_length=1, max_length=255)
    new_status: Literal["restock", "available", "quarantine", "donation_pending", "recycle"]
    reason: str | None = Field(default=None, max_length=2000)


class TaskBody(_Body):
    title: str = Field(min_length=1, max_length=255)
    assignee_role: str = Field(min_length=1, max_length=64)
    description: str | None = Field(default=None, max_length=2000)
    due_in_days: int | None = Field(default=None, ge=0, le=365)


class ChannelSwitchBody(_Body):
    skus: list[Sku] = Field(min_length=1, max_length=500)
    to_channel: Literal["web", "outlet"]


class SopChecklistBody(_Body):
    sop_id: str = Field(min_length=1, max_length=64)
    add_items: list[str] = Field(min_length=1, max_length=50)


ActionType = Literal["apply_discount", "adjust_inventory", "create_task", "switch_channel", "update_sop_checklist"]


@dataclass(frozen=True)
class ActionDef:
    endpoint: str  # as the web names it in hashAgentRequest (no leading slash)
    body_model: type[_Body]
    capability: Capability
    editable_fields: tuple[str, ...] = ()
    write_class: WriteClass = WriteClass.SHOP_CHANGE


ACTIONS: dict[str, ActionDef] = {
    "apply_discount": ActionDef("pricing/discounts", DiscountBody, Capability.PROMOTION, ("percent", "duration_days")),
    "adjust_inventory": ActionDef("inventory/adjustments", InventoryAdjustmentBody, Capability.INVENTORY),
    "create_task": ActionDef("tasks", TaskBody, Capability.OPS_TASKS, ("title", "description", "due_in_days")),
    "switch_channel": ActionDef("channels/switch", ChannelSwitchBody, Capability.INVENTORY),
    "update_sop_checklist": ActionDef("sop/checklists", SopChecklistBody, Capability.OPS_TASKS, ("add_items",)),
}


def normalize_body(action_type: str, body: dict[str, Any]) -> dict[str, Any]:
    """Validate a body against its endpoint's schema and return it in canonical form (None fields dropped)."""
    model = ACTIONS[action_type].body_model.model_validate(body)
    return model.model_dump(exclude_none=True)


class ActionDraft(BaseModel):
    """An action before it has an id and an idempotency key (what option builders produce)."""

    model_config = ConfigDict(frozen=True)

    type: ActionType
    body: dict[str, Any]
    description: str = ""


class ActionSpec(BaseModel):
    model_config = ConfigDict(frozen=True)

    action_id: str
    type: ActionType
    body: dict[str, Any]
    idempotency_key: str
    description: str = ""

    @property
    def definition(self) -> ActionDef:
        return ACTIONS[self.type]

    @property
    def endpoint(self) -> str:
        return self.definition.endpoint

    @property
    def capability(self) -> Capability:
        return self.definition.capability

    @property
    def editable_fields(self) -> tuple[str, ...]:
        return self.definition.editable_fields

    def with_edits(self, edits: dict[str, Any]) -> ActionSpec:
        """The same action with a person's edits applied (only declared editable fields), re-validated."""
        not_editable = sorted(set(edits) - set(self.editable_fields))
        if not_editable:
            raise ValueError(f"{self.type}: fields {not_editable} cannot be edited")
        body = normalize_body(self.type, {**self.body, **edits})
        return self.model_copy(update={"body": body})


def to_spec(draft: ActionDraft, *, action_id: str, idempotency_key: str) -> ActionSpec:
    return ActionSpec(
        action_id=action_id,
        type=draft.type,
        body=normalize_body(draft.type, draft.body),
        idempotency_key=idempotency_key,
        description=draft.description,
    )
