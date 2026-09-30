"""Write tools for the copilot. Each one is gated by human-in-the-loop approval (Phase 8) and, like every write:

1. builds the exact Agent API body and checks the domain limits (a person's edit is limited like the model's call);
2. uses the idempotency key `{thread_id}:{tool_call_id}`, so a retry never applies twice;
3. sends the approval grant the web gateway stored for this tool call, if any.
"""

from __future__ import annotations

from typing import Any, Literal

from langchain.tools import tool

from shop_agent.domain.actions import ActionDraft, ActionType, to_spec
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


async def _write(action_type: ActionType, body: dict[str, Any], description: str, runtime: ShopToolRuntime) -> str:
    deps = await get_deps(runtime)
    thread_id = _thread_id(runtime)
    call_id = runtime.tool_call_id or "call"
    try:
        spec = to_spec(
            ActionDraft(type=action_type, body=body, description=description),
            action_id=call_id,
            idempotency_key=f"{thread_id}:{call_id}",
        )
        check_action(spec, deps.limits)
    except (LimitExceeded, ValueError) as exc:
        return f"ERROR: refused before sending: {exc}"
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
async def revert_action(of_key: str, runtime: ShopToolRuntime) -> str:
    """Undo an earlier action, identified by the idempotency key it was sent with."""
    deps = await get_deps(runtime)
    result = await deps.writer.revert(of_key, idempotency_key=f"{of_key}:revert", context={"of_key": of_key})
    return f"Reverted: {result.detail}" if result.ok else f"ERROR: {result.status_code} {result.detail}"


WRITE_TOOLS = [apply_discount, adjust_inventory, switch_channel, create_task, update_sop_checklist, revert_action]
