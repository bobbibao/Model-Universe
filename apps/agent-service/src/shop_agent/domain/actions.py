"""ActionSpec: one write, exactly as the web Agent API receives it (ADR-0011).

An action's `body` IS the request body of its endpoint (packages/contracts/openapi/web-agent-api.yaml, without
`dry_run`), so the approval grant can bind its hash. Endpoints with a path parameter (`marketing/ads/{ref}/activate`)
take it from `path_params`; `endpoint` is the concrete path, the one the web hashes. `validate` builds complete specs
before review; `act` sends them verbatim with their idempotency keys.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from shop_agent.domain.capabilities import Capability, WriteClass

Sku = str
Platform = Literal["meta", "google", "tiktok"]
AD_CAPABILITY: dict[str, Capability] = {
    "meta": Capability.ADS_META,
    "google": Capability.ADS_GOOGLE,
    "tiktok": Capability.ADS_TIKTOK,
}
REF_PATTERN = r"^[a-z0-9][a-z0-9_-]{2,63}$"
CAMPAIGN_REF_PATTERN = r"^ag-[a-z0-9]{8}-[a-z0-9_-]{1,40}$"
COUPON_CODE_PATTERN = r"^AI-[A-Z0-9]{4,12}$"
LINK_PATH_PATTERN = r"^/\S*$"


class _Body(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DiscountBody(_Body):
    skus: list[Sku] | None = Field(default=None, min_length=1, max_length=500)
    category: str | None = Field(default=None, min_length=1, max_length=64)
    percent: float = Field(gt=0, le=90)
    duration_days: int = Field(ge=1, le=90)
    starts_at: AwareDatetime | None = None
    campaign_ref: str | None = Field(default=None, max_length=64)
    replace_existing: bool | None = None

    @model_validator(mode="after")
    def _one_scope(self) -> DiscountBody:
        if (self.skus is None) == (self.category is None):
            raise ValueError("a discount needs exactly one of skus and category")
        return self


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


class CouponBody(_Body):
    code: str = Field(pattern=COUPON_CODE_PATTERN)
    title: str = Field(min_length=1, max_length=255)
    percent: int = Field(ge=1, le=50)
    duration_days: int = Field(ge=1, le=90)
    starts_at: AwareDatetime | None = None
    min_order_vnd: int | None = Field(default=None, ge=0, le=1_000_000_000)
    usage_limit: int | None = Field(default=None, ge=1, le=100_000)
    campaign_ref: str | None = Field(default=None, max_length=64)


class ReasonBody(_Body):
    """Protective requests (end a promotion, pause an ad): an optional reason for the audit."""

    reason: str | None = Field(default=None, max_length=2000)


class CampaignBody(_Body):
    ref: str = Field(pattern=CAMPAIGN_REF_PATTERN)
    name: str = Field(min_length=1, max_length=255)
    objective: Literal["sales", "traffic", "awareness", "clearance"]
    channels: list[Capability] = Field(min_length=1, max_length=5)
    thread_id: str | None = Field(default=None, max_length=64)
    starts_at: AwareDatetime | None = None
    duration_days: int = Field(ge=1, le=90)
    budget_vnd: int | None = Field(default=None, ge=0, le=1_000_000_000)

    @model_validator(mode="after")
    def _distinct_channels(self) -> CampaignBody:
        if len(set(self.channels)) != len(self.channels):
            raise ValueError("channels must not repeat")
        if not set(self.channels) <= set(GROWTH_CAPABILITIES):
            raise ValueError("channels are growth capabilities (promotion, facebook_post, ads_*)")
        return self


class PostBody(_Body):
    ref: str = Field(pattern=REF_PATTERN)
    campaign_ref: str | None = Field(default=None, max_length=64)
    message: str = Field(min_length=1, max_length=5000)
    link_path: str | None = Field(default=None, pattern=LINK_PATH_PATTERN, max_length=500)
    sku: Sku | None = None
    asset_id: int | None = Field(default=None, ge=1)
    scheduled_at: AwareDatetime | None = None


class AdBody(_Body):
    ref: str = Field(pattern=REF_PATTERN)
    campaign_ref: str = Field(min_length=1, max_length=64)
    platform: Platform
    objective: Literal["traffic", "conversions"] | None = None
    daily_budget_vnd: int = Field(ge=10_000, le=1_000_000_000)
    duration_days: int = Field(ge=1, le=30)
    starts_at: AwareDatetime | None = None
    link_path: str = Field(pattern=LINK_PATH_PATTERN, max_length=500)
    headline: str | None = Field(default=None, max_length=40)
    primary_text: str | None = Field(default=None, max_length=2000)
    headlines: list[str] | None = Field(default=None, max_length=15)
    descriptions: list[str] | None = Field(default=None, max_length=4)
    keywords: list[str] | None = Field(default=None, max_length=50)
    ad_text: str | None = Field(default=None, max_length=100)
    sku: Sku | None = None
    asset_id: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def _platform_fields(self) -> AdBody:
        """What each platform needs (docs/GROWTH_AGENT.md section 3); the web refuses the same with 400."""
        if self.platform == "meta" and not (self.headline and self.primary_text and (self.sku or self.asset_id)):
            raise ValueError("a Meta ad needs headline, primary_text and an image (sku or asset_id)")
        if self.platform == "google":
            if len(self.headlines or []) < 3 or len(self.descriptions or []) < 2 or not self.keywords:
                raise ValueError("a Google Search ad needs 3-15 headlines, 2-4 descriptions and keywords")
            if any(not 1 <= len(h) <= 30 for h in self.headlines or []):
                raise ValueError("Google headlines are 1-30 characters")
            if any(not 1 <= len(d) <= 90 for d in self.descriptions or []):
                raise ValueError("Google descriptions are 1-90 characters")
            if any(not 1 <= len(k) <= 80 for k in self.keywords or []):
                raise ValueError("Google keywords are 1-80 characters")
        if self.platform == "tiktok" and not (self.ad_text and self.asset_id):
            raise ValueError("a TikTok ad needs ad_text and a video (asset_id)")
        return self

    @property
    def total_budget_vnd(self) -> int:
        return self.daily_budget_vnd * self.duration_days


class EmptyBody(_Body):
    """Requests whose only parameter is in the path (activate an ad)."""


class AdBudgetBody(_Body):
    daily_budget_vnd: int = Field(ge=10_000, le=1_000_000_000)


class AdOptimizationBody(_Body):
    objective: Literal["traffic", "conversions"]


ActionType = Literal[
    "apply_discount",
    "adjust_inventory",
    "create_task",
    "switch_channel",
    "update_sop_checklist",
    "create_coupon",
    "end_promotion",
    "create_campaign",
    "create_post",
    "create_ad",
    "activate_ad",
    "pause_ad",
    "set_ad_budget",
    "set_ad_optimization",
]

GROWTH_CAPABILITIES = (
    Capability.PROMOTION,
    Capability.FACEBOOK_POST,
    Capability.ADS_META,
    Capability.ADS_GOOGLE,
    Capability.ADS_TIKTOK,
)

# Where an action's capability comes from: fixed by its type, the body's `platform` (a new ad), the body's `channels`
# (a campaign spans them), or named by whoever builds the action (an existing ad's platform, which only the snapshot
# knows).
CapabilitySource = Literal["fixed", "platform", "channels", "given"]


@dataclass(frozen=True)
class ActionDef:
    endpoint: str  # the contract's path without the leading slash; `{ref}` is filled from path_params
    body_model: type[_Body]
    capability: Capability | None = None
    editable_fields: tuple[str, ...] = ()
    write_class: WriteClass = WriteClass.SHOP_CHANGE
    capability_source: CapabilitySource = "fixed"


ACTIONS: dict[str, ActionDef] = {
    "apply_discount": ActionDef("pricing/discounts", DiscountBody, Capability.PROMOTION, ("percent", "duration_days")),
    "adjust_inventory": ActionDef("inventory/adjustments", InventoryAdjustmentBody, Capability.INVENTORY),
    "create_task": ActionDef("tasks", TaskBody, Capability.OPS_TASKS, ("title", "description", "due_in_days")),
    "switch_channel": ActionDef("channels/switch", ChannelSwitchBody, Capability.INVENTORY),
    "update_sop_checklist": ActionDef("sop/checklists", SopChecklistBody, Capability.OPS_TASKS, ("add_items",)),
    "create_coupon": ActionDef(
        "promotions/coupons",
        CouponBody,
        Capability.PROMOTION,
        ("title", "percent", "duration_days", "min_order_vnd", "usage_limit"),
    ),
    "end_promotion": ActionDef(
        "promotions/{ref}/end", ReasonBody, Capability.PROMOTION, write_class=WriteClass.PROTECTIVE
    ),
    "create_campaign": ActionDef(
        "marketing/campaigns", CampaignBody, editable_fields=("name", "budget_vnd"), capability_source="channels"
    ),
    "create_post": ActionDef("marketing/posts", PostBody, Capability.FACEBOOK_POST, ("message", "scheduled_at")),
    "create_ad": ActionDef(
        "marketing/ads",
        AdBody,
        editable_fields=("daily_budget_vnd", "duration_days", "headline", "primary_text", "headlines", "descriptions"),
        capability_source="platform",
    ),
    "activate_ad": ActionDef("marketing/ads/{ref}/activate", EmptyBody, capability_source="given"),
    "pause_ad": ActionDef(
        "marketing/ads/{ref}/pause", ReasonBody, write_class=WriteClass.PROTECTIVE, capability_source="given"
    ),
    # Raising a budget is a shop change; lowering it is protective (the web decides from the ad's current budget).
    "set_ad_budget": ActionDef(
        "marketing/ads/{ref}/budget", AdBudgetBody, editable_fields=("daily_budget_vnd",), capability_source="given"
    ),
    "set_ad_optimization": ActionDef("marketing/ads/{ref}/optimization", AdOptimizationBody, capability_source="given"),
}


def normalize_body(action_type: str, body: dict[str, Any]) -> dict[str, Any]:
    """Validate a body against its endpoint's schema and return it in canonical JSON form (None fields dropped)."""
    model = ACTIONS[action_type].body_model.model_validate(body)
    return model.model_dump(mode="json", exclude_none=True)


def fill_path(template: str, path_params: Mapping[str, str]) -> str:
    """`marketing/ads/{ref}/activate` + {"ref": "x"} -> `marketing/ads/x/activate`; a missing parameter is an error."""
    try:
        return template.format_map(dict(path_params))
    except KeyError as exc:
        raise ValueError(f"{template} needs the path parameter {exc.args[0]}") from exc


class _Action(BaseModel):
    model_config = ConfigDict(frozen=True)

    type: ActionType
    body: dict[str, Any]
    path_params: dict[str, str] = Field(default_factory=dict)
    # The capability of an action on an existing object (an ad's platform), named by its builder.
    capability_hint: Capability | None = None
    description: str = ""

    @model_validator(mode="after")
    def _complete(self) -> _Action:
        definition = ACTIONS[self.type]
        fill_path(definition.endpoint, self.path_params)
        if definition.capability_source == "given" and self.capability_hint is None:
            raise ValueError(f"{self.type} needs capability_hint (the ad's platform capability)")
        return self

    @property
    def definition(self) -> ActionDef:
        return ACTIONS[self.type]

    @property
    def endpoint(self) -> str:
        return fill_path(self.definition.endpoint, self.path_params)

    @property
    def capabilities(self) -> tuple[Capability, ...]:
        definition = self.definition
        if definition.capability_source == "platform":
            return (AD_CAPABILITY[str(self.body["platform"])],)
        if definition.capability_source == "channels":
            return tuple(Capability(c) for c in self.body["channels"])
        if definition.capability_source == "given" and self.capability_hint is not None:
            return (self.capability_hint,)
        assert definition.capability is not None  # noqa: S101 - every fixed definition names one
        return (definition.capability,)

    @property
    def capability(self) -> Capability:
        """The first capability (a campaign spans several: use `capabilities`)."""
        return self.capabilities[0]

    @property
    def write_class(self) -> WriteClass:
        return self.definition.write_class

    @property
    def editable_fields(self) -> tuple[str, ...]:
        return self.definition.editable_fields


class ActionDraft(_Action):
    """An action before it has an id and an idempotency key (what option builders produce)."""


class ActionSpec(_Action):
    action_id: str
    idempotency_key: str

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
        path_params=draft.path_params,
        capability_hint=draft.capability_hint,
        idempotency_key=idempotency_key,
        description=draft.description,
    )


def apply_edits(actions: Sequence[ActionSpec], args: Mapping[str, Any]) -> list[ActionSpec]:
    """A person's edit of an option (`{"percent": 25}`), applied the way the web gateway applies it before signing.

    Each field goes to every action of the option that declares it editable; a field that no action declares is
    refused. Bodies are re-validated, ids and idempotency keys are kept.
    """
    editable = {name for action in actions for name in action.editable_fields}
    unknown = sorted(set(args) - editable)
    if unknown:
        raise ValueError(f"fields {unknown} cannot be edited in this option")
    return [
        action.with_edits({k: v for k, v in args.items() if k in action.editable_fields}) if args else action
        for action in actions
    ]
