"""Write tools for the copilot. Each one is gated by human-in-the-loop approval (`agents/approval.py`) and, like every
write:

1. builds the exact Agent API request from its arguments (`write_request`: the arguments are the body, except a path
   parameter such as an ad's `ref`; empty ones are left out; a value the request would write differently, such as a
   time without seconds, is refused). The web gateway builds the same request from the call it shows a person and
   signs the approval grant over it, pinned by packages/contracts/test-vectors/copilot/write-tools.json;
2. checks the domain limits and the shop's rules on a fresh snapshot (`domain.growth.policies`: the web refuses the
   same), so a person's edit is limited like the model's call;
3. uses the idempotency key `{thread_id}:{tool_call_id}`, so a retry never applies twice;
4. sends the approval grant the gateway put in the thread's state for this tool call (`approval_grants`, written
   with the resume command), if any.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any, Literal

from langchain.tools import tool

from shop_agent.domain.actions import (
    ACTIONS,
    AD_CAPABILITY,
    ActionDraft,
    ActionSpec,
    ActionType,
    normalize_body,
    to_spec,
)
from shop_agent.domain.approval import canonical_json
from shop_agent.domain.capabilities import WriteClass
from shop_agent.domain.growth.policies import before, evaluate, state_from_snapshot
from shop_agent.domain.growth.snapshot import GrowthSnapshot
from shop_agent.domain.money import format_vnd
from shop_agent.domain.policies.limits import LimitExceeded, Limits, check_action
from shop_agent.tools.deps import ShopToolRuntime, get_deps

GRANTS_KEY = "approval_grants"


@dataclass(frozen=True)
class WriteTool:
    action_type: ActionType
    describe: Callable[[Mapping[str, Any]], str]  # Vietnamese, from the request body plus the path parameter
    path_param: str | None = None

    @property
    def protective(self) -> bool:
        return ACTIONS[self.action_type].write_class is WriteClass.PROTECTIVE


WRITES: dict[str, WriteTool] = {
    "apply_discount": WriteTool(
        "apply_discount", lambda a: f"Giảm {a['percent']:g}% cho {len(a['skus'])} mã trong {a['duration_days']} ngày"
    ),
    "adjust_inventory": WriteTool("adjust_inventory", lambda a: f"{a['sku']} -> {a['new_status']}"),
    "switch_channel": WriteTool("switch_channel", lambda a: f"Chuyển {len(a['skus'])} mã sang {a['to_channel']}"),
    "create_task": WriteTool("create_task", lambda a: str(a["title"])),
    "update_sop_checklist": WriteTool("update_sop_checklist", lambda a: f"{a['sop_id']}: +{len(a['add_items'])} mục"),
    "create_coupon": WriteTool(
        "create_coupon", lambda a: f"Mã {a['code']}: giảm {a['percent']}% trong {a['duration_days']} ngày"
    ),
    "end_promotion": WriteTool("end_promotion", lambda a: f"Kết thúc khuyến mãi {a['ref']}", "ref"),
    "create_post": WriteTool("create_post", lambda a: f"Bài đăng {a['ref']}"),
    "activate_ad": WriteTool("activate_ad", lambda a: f"Bật quảng cáo {a['ref']}", "ref"),
    "pause_ad": WriteTool("pause_ad", lambda a: f"Tạm dừng quảng cáo {a['ref']}", "ref"),
    "set_ad_budget": WriteTool(
        "set_ad_budget", lambda a: f"Ngân sách quảng cáo {a['ref']}: {format_vnd(a['daily_budget_vnd'])}/ngày", "ref"
    ),
}


def _split(entry: WriteTool, args: Mapping[str, Any]) -> tuple[dict[str, Any], dict[str, str]]:
    """A tool call's arguments as (request body, path parameters)."""
    path_params = {entry.path_param: str(args.get(entry.path_param, ""))} if entry.path_param else {}
    return {k: v for k, v in args.items() if k != entry.path_param and v is not None}, path_params


def write_request(
    name: str, args: Mapping[str, Any], snapshot: GrowthSnapshot, *, thread_id: str, call_id: str
) -> ActionSpec:
    """The exact request a write tool call sends. Raises ValueError when it cannot be built (an invalid body, an
    unknown ad)."""
    entry = WRITES[name]
    body, path_params = _split(entry, args)
    capability = None
    if ACTIONS[entry.action_type].capability_source == "given":  # an existing ad: its platform is in the snapshot
        ref = path_params["ref"]
        ad = next((a for a in snapshot.ads if a.ref == ref), None)
        if ad is None:
            raise ValueError(f"no ad {ref}")
        capability = AD_CAPABILITY.get(ad.platform)
    spec = to_spec(
        ActionDraft(type=entry.action_type, body=body, path_params=path_params, capability_hint=capability),
        action_id=call_id,
        idempotency_key=f"{thread_id}:{call_id}",
    )
    keys = set(body) | set(spec.body)
    rewritten = sorted(k for k in keys if canonical_json(body.get(k)) != canonical_json(spec.body.get(k)))
    if rewritten:  # the gateway signs the arguments as they are: they must already be the request's values
        examples = ", ".join(f"{k}={canonical_json(spec.body.get(k))}" for k in rewritten)
        raise ValueError(f"write {', '.join(rewritten)} exactly as the request takes them ({examples})")
    return spec.model_copy(update={"description": entry.describe({**spec.body, **path_params})})


def describe_call(name: str, args: Mapping[str, Any]) -> str:
    """What a write tool call would do, in Vietnamese (the approval card's title); the tool name when its arguments
    are not a valid request."""
    entry = WRITES[name]
    body, path_params = _split(entry, args)
    try:
        return entry.describe({**normalize_body(entry.action_type, body), **path_params})
    except (ValueError, KeyError, TypeError):
        return name


def refusal(spec: ActionSpec, snapshot: GrowthSnapshot, limits: Limits, *, has_grant: bool) -> str | None:
    """Why the request would be refused, known before sending: the domain limits, then the shop's rules as the web
    applies them (`has_grant`: whether a verified grant covers it). None when it would run."""
    try:
        check_action(spec, limits)
    except LimitExceeded as exc:
        return f"ERROR: refused before sending: {exc}"
    state = before(state_from_snapshot(snapshot), spec)
    verdict = evaluate(spec.definition.endpoint, spec.path_params, spec.body, state, has_grant=has_grant)
    if not verdict.ok:
        return f"ERROR: the shop's rules refuse it ({verdict.reason or verdict.code}): {verdict.detail}"
    return None


def thread_id_of(config: Mapping[str, Any] | None) -> str:
    return str((config or {}).get("configurable", {}).get("thread_id") or "local")


def _grant(runtime: ShopToolRuntime) -> str | None:
    grants = (runtime.state or {}).get(GRANTS_KEY) or {}
    token = grants.get(runtime.tool_call_id) if runtime.tool_call_id else None
    return str(token) if token else None


async def _write(name: str, runtime: ShopToolRuntime, **args: Any) -> str:
    deps = await get_deps(runtime)
    thread_id = thread_id_of(runtime.config)
    call_id = runtime.tool_call_id or "call"
    snapshot = await deps.reader.growth_snapshot(deps.clock())
    try:
        spec = write_request(name, args, snapshot, thread_id=thread_id, call_id=call_id)
    except ValueError as exc:
        return f"ERROR: refused before sending: {exc}"
    # The approval itself is the web's call (the grant); every other refusal is known now.
    problem = refusal(spec, snapshot, deps.limits, has_grant=True)
    if problem is not None:
        return problem
    context = {"thread_id": thread_id, "action_id": call_id, "model_profile": deps.model_profile}
    result = await deps.writer.execute(spec, grant=_grant(runtime), context=context)
    if result.ok:
        return f"Done ({result.ref}): {result.detail or spec.description}. Idempotency key: {spec.idempotency_key}"
    return f"ERROR: the shop refused ({result.status_code} {result.error_code}): {result.detail}"


@tool
async def apply_discount(skus: list[str], percent: float, duration_days: int, runtime: ShopToolRuntime) -> str:
    """Apply a time-limited percentage discount to SKUs. The list price is never changed."""
    return await _write("apply_discount", runtime, skus=skus, percent=percent, duration_days=duration_days)


@tool
async def adjust_inventory(
    sku: str,
    new_status: Literal["restock", "available", "quarantine", "donation_pending", "recycle"],
    runtime: ShopToolRuntime,
    reason: str | None = None,
) -> str:
    """Change a SKU's inventory status (anything but available/restock hides it from the storefront)."""
    return await _write("adjust_inventory", runtime, sku=sku, new_status=new_status, reason=reason or None)


@tool
async def switch_channel(skus: list[str], to_channel: Literal["web", "outlet"], runtime: ShopToolRuntime) -> str:
    """Move SKUs to a sales channel (web or outlet)."""
    return await _write("switch_channel", runtime, skus=skus, to_channel=to_channel)


@tool
async def create_task(
    title: str,
    assignee_role: str,
    runtime: ShopToolRuntime,
    description: str | None = None,
    due_in_days: int | None = None,
) -> str:
    """Create a task for shop staff (merchandiser, warehouse, logistics, ...)."""
    return await _write(
        "create_task",
        runtime,
        title=title,
        assignee_role=assignee_role,
        description=description or None,
        due_in_days=due_in_days,
    )


@tool
async def update_sop_checklist(sop_id: str, add_items: list[str], runtime: ShopToolRuntime) -> str:
    """Append items to a named SOP checklist."""
    return await _write("update_sop_checklist", runtime, sop_id=sop_id, add_items=add_items)


@tool
async def create_coupon(
    code: str,
    title: str,
    percent: int,
    duration_days: int,
    runtime: ShopToolRuntime,
    min_order_vnd: int | None = None,
    usage_limit: int | None = None,
    campaign_ref: str | None = None,
) -> str:
    """Create a percentage coupon for the whole cart. `code` is AI- plus 4-12 capital letters or digits; `title` is
    shown to customers in Vietnamese. At most 50% combined with any running discount (the legal maximum)."""
    return await _write(
        "create_coupon",
        runtime,
        code=code,
        title=title,
        percent=percent,
        duration_days=duration_days,
        min_order_vnd=min_order_vnd,
        usage_limit=usage_limit,
        campaign_ref=campaign_ref,
    )


@tool
async def end_promotion(ref: str, runtime: ShopToolRuntime, reason: str | None = None) -> str:
    """End the agent's promotions now: a coupon code (AI-...) or every discount and coupon of a campaign ref.
    Promotions an admin created are never touched."""
    return await _write("end_promotion", runtime, ref=ref, reason=reason or None)


@tool
async def create_post(
    ref: str,
    message: str,
    runtime: ShopToolRuntime,
    link_path: str | None = None,
    sku: str | None = None,
    campaign_ref: str | None = None,
    scheduled_at: str | None = None,
) -> str:
    """Publish (or schedule, ISO time at least 10 minutes ahead) a post on the shop's Facebook Page. `message` is the
    Vietnamese post text; `link_path` a storefront path; `sku` uses the product's image. At most 2 posts a day, 4 hours
    apart."""
    return await _write(
        "create_post",
        runtime,
        ref=ref,
        message=message,
        link_path=link_path,
        sku=sku,
        campaign_ref=campaign_ref,
        scheduled_at=scheduled_at,
    )


@tool
async def activate_ad(ref: str, runtime: ShopToolRuntime) -> str:
    """Start delivering a paused ad (it spends its daily budget from now on)."""
    return await _write("activate_ad", runtime, ref=ref)


@tool
async def pause_ad(ref: str, runtime: ShopToolRuntime, reason: str | None = None) -> str:
    """Pause an ad now (always allowed)."""
    return await _write("pause_ad", runtime, ref=ref, reason=reason or None)


@tool
async def set_ad_budget(ref: str, daily_budget_vnd: int, runtime: ShopToolRuntime) -> str:
    """Change an ad's daily budget in whole VND (raising it reserves the difference for the days left)."""
    return await _write("set_ad_budget", runtime, ref=ref, daily_budget_vnd=daily_budget_vnd)


@tool
async def revert_action(of_key: str, runtime: ShopToolRuntime) -> str:
    """Undo an earlier action, identified by the idempotency key it was sent with."""
    deps = await get_deps(runtime)
    result = await deps.writer.revert(of_key, idempotency_key=f"{of_key}:revert", context={"of_key": of_key})
    return f"Reverted: {result.detail}" if result.ok else f"ERROR: {result.status_code} {result.detail}"


WRITE_TOOLS = [
    apply_discount,
    adjust_inventory,
    switch_channel,
    create_task,
    update_sop_checklist,
    create_coupon,
    end_promotion,
    create_post,
    activate_ad,
    pause_ad,
    set_ad_budget,
    revert_action,
]
