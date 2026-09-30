"""Small builders shared by tests, so each test states only what it cares about."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from shop_agent.domain.actions import ActionDraft, ActionSpec, to_spec
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
}
