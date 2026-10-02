"""Small builders shared by tests, so each test states only what it cares about."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from shop_agent.domain.actions import ActionDraft, ActionSpec, to_spec
from shop_agent.domain.capabilities import Capability
from shop_agent.domain.models import Opportunity, Severity, make_fingerprint
from shop_agent.domain.shop import ReturnRecord, ShopSnapshot, StockItem

NOW = datetime(2026, 9, 29, 9, 0, tzinfo=UTC)


def item(
    sku: str,
    *,
    quantity: int = 40,
    cost: int = 500_000,
    price: int = 900_000,
    days: int = 120,
    category: str = "ao",
    channel: str = "web",
    condition: str = "new",
) -> StockItem:
    return StockItem(sku, f"Sản phẩm {sku}", category, quantity, cost, price, days, channel, condition)


def returned(
    sku: str, *, condition: str = "new", reason: str = "size", refund: int = 400_000, n: int = 0
) -> ReturnRecord:
    return ReturnRecord(f"ORD-{sku}-{n}", sku, reason, condition, NOW - timedelta(days=3), refund)


def snapshot(
    *items: StockItem, sold: dict[str, int] | None = None, returns: tuple[ReturnRecord, ...] = (), now: datetime = NOW
) -> ShopSnapshot:
    return ShopSnapshot(now, tuple(items), returns, sold or {})


def opportunity(
    kind: str = "dead_stock", skus: tuple[str, ...] = ("A1", "A2"), severity: Severity = Severity.MEDIUM
) -> Opportunity:
    return Opportunity(
        kind=kind,
        fingerprint=make_fingerprint(kind, skus),
        severity=severity,
        title=f"test {kind}",
        summary=f"test {kind}",
        skus=skus,
        detected_at=NOW,
    )


def discount(
    skus: tuple[str, ...] = ("A1",), percent: float = 20.0, days: int = 14, key: str = "t1:discount:1"
) -> ActionSpec:
    draft = ActionDraft(type="apply_discount", body={"skus": list(skus), "percent": percent, "duration_days": days})
    return to_spec(draft, action_id="a1", idempotency_key=key)


# One valid body per action type (contract tests send each one through the OpenAPI-validated web double).
SAMPLE_BODIES: dict[str, dict[str, object]] = {
    "apply_discount": {"skus": ["A1", "A2"], "percent": 20.0, "duration_days": 14},
    "adjust_inventory": {"sku": "A1", "new_status": "quarantine", "reason": "damaged"},
    "create_task": {"title": "Chụp lại ảnh", "assignee_role": "merchandiser", "description": "A1", "due_in_days": 3},
    "switch_channel": {"skus": ["A1"], "to_channel": "outlet"},
    "update_sop_checklist": {"sop_id": "SOP-002", "add_items": ["Kiểm tra bảng size"]},
    "create_coupon": {
        "code": "AI-7F3A9C",
        "title": "Ưu đãi cuối tuần",
        "percent": 10,
        "duration_days": 3,
        "min_order_vnd": 500_000,
        "usage_limit": 200,
        "campaign_ref": "ag-1234abcd-o1",
    },
    "end_promotion": {"reason": "incremental margin below the floor"},
    "create_campaign": {
        "ref": "ag-1234abcd-o1",
        "name": "Xả hàng áo khoác",
        "objective": "clearance",
        "channels": ["promotion", "facebook_post", "ads_meta"],
        "thread_id": "1234abcd-0000-0000-0000-000000000000",
        "starts_at": "2026-10-01T02:00:00Z",
        "duration_days": 7,
        "budget_vnd": 1_500_000,
    },
    "create_post": {
        "ref": "ag-1234abcd-o1-p1",
        "campaign_ref": "ag-1234abcd-o1",
        "message": "Áo khoác gió mới về, mời bạn ghé xem.",
        "link_path": "/shop/product/12",
        "sku": "A1",
    },
    "create_ad": {
        "ref": "ag-1234abcd-o1-meta",
        "campaign_ref": "ag-1234abcd-o1",
        "platform": "meta",
        "objective": "traffic",
        "daily_budget_vnd": 200_000,
        "duration_days": 5,
        "link_path": "/shop/product/12",
        "headline": "Áo khoác gió",
        "primary_text": "Nhẹ, chống nước, đủ size.",
        "sku": "A1",
    },
    "activate_ad": {},
    "pause_ad": {"reason": "ROAS below the floor"},
    "set_ad_budget": {"daily_budget_vnd": 150_000},
    "set_ad_optimization": {"objective": "conversions"},
}
# Actions on an existing object name it in the path, and the capability of the ad they act on.
SAMPLE_PATHS: dict[str, dict[str, str]] = {
    "end_promotion": {"ref": "ag-1234abcd-o1"},
    "activate_ad": {"ref": "ag-1234abcd-o1-meta"},
    "pause_ad": {"ref": "ag-1234abcd-o1-meta"},
    "set_ad_budget": {"ref": "ag-1234abcd-o1-meta"},
    "set_ad_optimization": {"ref": "ag-1234abcd-o1-meta"},
}
SAMPLE_HINTS: dict[str, Capability] = {
    t: Capability.ADS_META for t in ("activate_ad", "pause_ad", "set_ad_budget", "set_ad_optimization")
}


def sample_spec(action_type: str, *, key: str = "k1", body: dict[str, object] | None = None) -> ActionSpec:
    """An ActionSpec of each type with a body the contract accepts."""
    return ActionSpec(
        action_id="a1",
        type=action_type,
        body=dict(SAMPLE_BODIES[action_type] if body is None else body),
        path_params=SAMPLE_PATHS.get(action_type, {}),
        capability_hint=SAMPLE_HINTS.get(action_type),
        idempotency_key=key,
    )
