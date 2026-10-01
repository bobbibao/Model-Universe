"""Write tools for the copilot. Each one is gated by human-in-the-loop approval (Phase 8) and, like every write:

1. builds the exact Agent API body and checks the domain limits and the shop's rules on a fresh snapshot
   (`domain.growth.policies`: the web refuses the same), so a person's edit is limited like the model's call;
2. uses the idempotency key `{thread_id}:{tool_call_id}`, so a retry never applies twice;
3. sends the approval grant the web gateway stored for this tool call, if any.
"""

from __future__ import annotations

from typing import Any, Literal

from langchain.tools import tool

from shop_agent.domain.actions import AD_CAPABILITY, ActionDraft, ActionType, to_spec
from shop_agent.domain.capabilities import Capability
from shop_agent.domain.growth.policies import before, evaluate, state_from_snapshot
from shop_agent.domain.policies.limits import LimitExceeded, check_action
from shop_agent.tools.deps import ShopToolRuntime, get_deps

GRANTS_NAMESPACE = "grants"


def _thread_id(runtime: ShopToolRuntime) -> str:
    configurable = (runtime.config or {}).get("configurable", {})
    return str(configurable.get("thread_id") or "local")


async def _grant(runtime: ShopToolRuntime, thread_id: str) -> str | None:
    if runtime.store is None or not runtime.tool_call_id:
        return None
    item = await runtime.store.aget((GRANTS_NAMESPACE, thread_id), runtime.tool_call_id)
    return str(item.value["token"]) if item and "token" in item.value else None


async def _write(
    action_type: ActionType,
    body: dict[str, Any],
    description: str,
    runtime: ShopToolRuntime,
    *,
    ref: str | None = None,
    capability: Capability | None = None,
) -> str:
    deps = await get_deps(runtime)
    thread_id = _thread_id(runtime)
    call_id = runtime.tool_call_id or "call"
    try:
        spec = to_spec(
            ActionDraft(
                type=action_type,
                body=body,
                path_params={"ref": ref} if ref is not None else {},
                capability_hint=capability,
                description=description,
            ),
            action_id=call_id,
            idempotency_key=f"{thread_id}:{call_id}",
        )
        check_action(spec, deps.limits)
    except (LimitExceeded, ValueError) as exc:
        return f"ERROR: refused before sending: {exc}"
    state = before(state_from_snapshot(await deps.reader.growth_snapshot(deps.clock())), spec)
    verdict = evaluate(spec.definition.endpoint, spec.path_params, spec.body, state, has_grant=True)
    if not verdict.ok:  # the approval itself is the web's call (the grant); every other refusal is known now
        return f"ERROR: the shop's rules refuse it ({verdict.reason or verdict.code}): {verdict.detail}"
    context = {"thread_id": thread_id, "action_id": call_id, "model_profile": deps.model_profile}
    result = await deps.writer.execute(spec, grant=await _grant(runtime, thread_id), context=context)
    if result.ok:
        return f"Done ({result.ref}): {result.detail or description}. Idempotency key: {spec.idempotency_key}"
    return f"ERROR: the shop refused ({result.status_code} {result.error_code}): {result.detail}"


@tool
async def apply_discount(skus: list[str], percent: float, duration_days: int, runtime: ShopToolRuntime) -> str:
    """Apply a time-limited percentage discount to SKUs. The list price is never changed."""
    return await _write(
        "apply_discount",
        {"skus": skus, "percent": percent, "duration_days": duration_days},
        f"Giảm {percent:g}% cho {len(skus)} mã trong {duration_days} ngày",
        runtime,
    )


@tool
async def adjust_inventory(
    sku: str,
    new_status: Literal["restock", "available", "quarantine", "donation_pending", "recycle"],
    runtime: ShopToolRuntime,
    reason: str | None = None,
) -> str:
    """Change a SKU's inventory status (anything but available/restock hides it from the storefront)."""
    body: dict[str, Any] = {"sku": sku, "new_status": new_status}
    if reason:
        body["reason"] = reason
    return await _write("adjust_inventory", body, f"{sku} -> {new_status}", runtime)


@tool
async def switch_channel(skus: list[str], to_channel: Literal["web", "outlet"], runtime: ShopToolRuntime) -> str:
    """Move SKUs to a sales channel (web or outlet)."""
    return await _write(
        "switch_channel", {"skus": skus, "to_channel": to_channel}, f"Chuyển {len(skus)} mã sang {to_channel}", runtime
    )


@tool
async def create_task(
    title: str,
    assignee_role: str,
    runtime: ShopToolRuntime,
    description: str | None = None,
    due_in_days: int | None = None,
) -> str:
    """Create a task for shop staff (merchandiser, warehouse, logistics, ...)."""
    body: dict[str, Any] = {"title": title, "assignee_role": assignee_role}
    if description:
        body["description"] = description
    if due_in_days is not None:
        body["due_in_days"] = due_in_days
    return await _write("create_task", body, title, runtime)


@tool
async def update_sop_checklist(sop_id: str, add_items: list[str], runtime: ShopToolRuntime) -> str:
    """Append items to a named SOP checklist."""
    return await _write(
        "update_sop_checklist", {"sop_id": sop_id, "add_items": add_items}, f"{sop_id}: +{len(add_items)} mục", runtime
    )


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
    body: dict[str, Any] = {"code": code, "title": title, "percent": percent, "duration_days": duration_days}
    optional = {"min_order_vnd": min_order_vnd, "usage_limit": usage_limit, "campaign_ref": campaign_ref}
    body |= {k: v for k, v in optional.items() if v is not None}
    return await _write("create_coupon", body, f"Mã {code}: giảm {percent}% trong {duration_days} ngày", runtime)


@tool
async def end_promotion(ref: str, runtime: ShopToolRuntime, reason: str | None = None) -> str:
    """End the agent's promotions now: a coupon code (AI-...) or every discount and coupon of a campaign ref.
    Promotions an admin created are never touched."""
    body = {"reason": reason} if reason else {}
    return await _write("end_promotion", body, f"Kết thúc khuyến mãi {ref}", runtime, ref=ref)


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
    body: dict[str, Any] = {"ref": ref, "message": message}
    optional = {"link_path": link_path, "sku": sku, "campaign_ref": campaign_ref, "scheduled_at": scheduled_at}
    body |= {k: v for k, v in optional.items() if v is not None}
    return await _write("create_post", body, f"Bài đăng {ref}", runtime)


async def _ad_capability(runtime: ShopToolRuntime, ref: str) -> Capability | None:
    deps = await get_deps(runtime)
    snapshot = await deps.reader.growth_snapshot(deps.clock())
    ad = next((a for a in snapshot.ads if a.ref == ref), None)
    return AD_CAPABILITY.get(ad.platform) if ad is not None else None


@tool
async def activate_ad(ref: str, runtime: ShopToolRuntime) -> str:
    """Start delivering a paused ad (it spends its daily budget from now on)."""
    capability = await _ad_capability(runtime, ref)
    if capability is None:
        return f"ERROR: no ad {ref}"
    return await _write("activate_ad", {}, f"Bật quảng cáo {ref}", runtime, ref=ref, capability=capability)


@tool
async def pause_ad(ref: str, runtime: ShopToolRuntime, reason: str | None = None) -> str:
    """Pause an ad now (always allowed)."""
    capability = await _ad_capability(runtime, ref)
    if capability is None:
        return f"ERROR: no ad {ref}"
    body = {"reason": reason} if reason else {}
    return await _write("pause_ad", body, f"Tạm dừng quảng cáo {ref}", runtime, ref=ref, capability=capability)


@tool
async def set_ad_budget(ref: str, daily_budget_vnd: int, runtime: ShopToolRuntime) -> str:
    """Change an ad's daily budget in whole VND (raising it reserves the difference for the days left)."""
    capability = await _ad_capability(runtime, ref)
    if capability is None:
        return f"ERROR: no ad {ref}"
    body = {"daily_budget_vnd": daily_budget_vnd}
    description = f"Ngân sách quảng cáo {ref}: {daily_budget_vnd:,} ₫/ngày".replace(",", ".")
    return await _write("set_ad_budget", body, description, runtime, ref=ref, capability=capability)


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
