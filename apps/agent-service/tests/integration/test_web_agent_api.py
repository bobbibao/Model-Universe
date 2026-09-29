"""Consumer-side contract test of the web app's Agent API (packages/contracts/openapi/web-agent-api.yaml).

Drives the real HttpShopActionAdapter and the webhook signing against a RUNNING apps/web-ecommerce, and checks
the storefront effect of every write through the public product API. Skipped unless configured:

    WEB_AGENT_API_URL=http://localhost:6050/api/agent/v1
    SHOP_API_TOKEN=<same value as AGENT_API_TOKEN in the web app>
    WEB_EVENTS_SECRET=<same value as AGENT_EVENTS_SECRET in the web app>

It writes to the web app's database (discounts, tasks, checklist items, reverted adjustments): point it at a
development database only.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
import uuid
from datetime import UTC, datetime
from typing import Any

import pytest

from ci_agent.infrastructure.events.web_webhook import sign_body
from ci_agent.infrastructure.http.client import UrllibJsonHttpClient
from ci_agent.infrastructure.shop.http_action import HttpShopActionAdapter

API_URL = os.environ.get("WEB_AGENT_API_URL", "").rstrip("/")
TOKEN = os.environ.get("SHOP_API_TOKEN", "")
EVENTS_SECRET = os.environ.get("WEB_EVENTS_SECRET", "")
WEB_URL = API_URL.removesuffix("/api/agent/v1")

pytestmark = pytest.mark.skipif(not (API_URL and TOKEN and EVENTS_SECRET),
                                reason="set WEB_AGENT_API_URL, SHOP_API_TOKEN and WEB_EVENTS_SECRET to run")


def _get(path: str) -> tuple[int, Any]:
    try:
        with urllib.request.urlopen(f"{WEB_URL}{path}", timeout=10) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, None


def _post(path: str, payload: dict[str, Any]) -> Any:
    resp = UrllibJsonHttpClient().post_json(f"{WEB_URL}{path}", payload)
    assert resp.status == 200, resp.body
    return resp.body.get("data", resp.body)  # public web endpoints answer with the ApiResponse envelope


def _key(label: str) -> str:
    return f"contract-test:{label}:{uuid.uuid4().hex[:12]}"


@pytest.fixture(scope="module")
def products() -> list[dict[str, Any]]:
    """Distinct sellable products, one per test, so tests do not interfere with each other."""
    status, listing = _get("/api/products?per_page=12&sort=newest")
    assert status == 200, "the web app's public product API should be reachable"
    details = [_get(f"/api/products/{p['id']}")[1] for p in listing["payload"]["data"]]
    return [d for d in details if d is not None]


@pytest.fixture()
def shop() -> HttpShopActionAdapter:
    return HttpShopActionAdapter(API_URL, TOKEN, UrllibJsonHttpClient())


def _product(product_id: int) -> tuple[int, Any]:
    return _get(f"/api/products/{product_id}")


def test_discount_is_applied_once_priced_everywhere_and_revertible(shop, products):
    product = products[0]
    key = _key("discount")
    first = shop.apply_discount(idempotency_key=key, skus=[product["sku"]], percent=20, duration_days=3)
    assert first.ok, first.detail
    assert first.external_ref

    replay = shop.apply_discount(idempotency_key=key, skus=[product["sku"]], percent=20, duration_days=3)
    assert replay.ok and replay.external_ref == first.external_ref  # retried, not applied twice

    conflict = shop.apply_discount(idempotency_key=key, skus=[product["sku"]], percent=30, duration_days=3)
    assert not conflict.ok and "status=409" in conflict.detail

    _, discounted = _product(product["id"])
    assert discounted["discountPercent"] == 20
    assert discounted["salePrice"] == round(product["price"] * 0.8)
    # The cart (and so checkout, which prices from the same lines) charges the discounted price.
    size = (product["availableSizes"] or [""])[0]
    quote = _post("/api/cart/quote", {"items": [{"productId": product["id"], "size": size, "quantity": 2}]})
    assert quote["lines"][0]["status"] == "OK"
    assert quote["subtotal"] == 2 * discounted["salePrice"]

    reverted = shop.revert(idempotency_key=f"{key}:revert", of_key=key)
    assert reverted.ok, reverted.detail
    assert shop.revert(idempotency_key=f"{key}:revert", of_key=key).ok  # the agent may retry compensation
    again = shop.revert(idempotency_key=f"{key}:revert-2", of_key=key)
    assert again.ok and "already reverted" in again.detail

    _, restored = _product(product["id"])
    assert restored["salePrice"] == restored["price"] and restored["discountPercent"] == 0


def test_inventory_adjustment_hides_the_product_until_reverted(shop, products):
    product = products[1]
    key = _key("inventory")
    result = shop.adjust_inventory(idempotency_key=key, sku=product["sku"], new_status="quarantine",
                                   reason="contract test")
    assert result.ok, result.detail
    assert _product(product["id"])[0] == 404  # held back from the storefront

    assert shop.revert(idempotency_key=f"{key}:revert", of_key=key).ok
    assert _product(product["id"])[0] == 200


def test_channel_switch_is_visible_and_revertible(shop, products):
    product = products[2]
    key = _key("channel")
    assert shop.switch_channel(idempotency_key=key, skus=[product["sku"]], to_channel="outlet").ok
    assert _product(product["id"])[1]["salesChannel"] == "outlet"
    assert shop.revert(idempotency_key=f"{key}:revert", of_key=key).ok
    assert _product(product["id"])[1]["salesChannel"] == "web"


def test_task_and_sop_checklist_are_created_and_revertible(shop):
    task_key, sop_key = _key("task"), _key("sop")
    task = shop.create_task(idempotency_key=task_key, title="Contract test task", assignee_role="warehouse",
                            description="created by test_web_agent_api", due_in_days=2)
    assert task.ok, task.detail
    sop = shop.update_sop_checklist(idempotency_key=sop_key, sop_id="SOP-TEST", add_items=["check the label"])
    assert sop.ok, sop.detail
    assert "cancelled" in shop.revert(idempotency_key=f"{task_key}:revert", of_key=task_key).detail
    assert "removed" in shop.revert(idempotency_key=f"{sop_key}:revert", of_key=sop_key).detail


def test_dry_run_changes_nothing_and_does_not_consume_the_key(shop, products):
    product = products[3]
    key = _key("dry-run")
    preview = shop.apply_discount(idempotency_key=key, skus=[product["sku"]], percent=15, duration_days=1,
                                  dry_run=True)
    assert preview.ok and preview.external_ref == "dry-run"
    assert _product(product["id"])[1]["discountPercent"] == 0

    real = shop.apply_discount(idempotency_key=key, skus=[product["sku"]], percent=15, duration_days=1)
    assert real.ok, real.detail
    assert shop.revert(idempotency_key=f"{key}:revert", of_key=key).ok


def test_failures_are_reported_not_applied(shop):
    unknown = shop.apply_discount(idempotency_key=_key("unknown"), skus=["NO-SUCH-SKU"], percent=10, duration_days=1)
    assert not unknown.ok and "status=404" in unknown.detail
    invalid = shop.apply_discount(idempotency_key=_key("invalid"), skus=["NO-SUCH-SKU"], percent=95, duration_days=1)
    assert not invalid.ok and "status=400" in invalid.detail
    assert not shop.revert(idempotency_key=_key("revert"), of_key="never-applied").ok

    wrong_token = HttpShopActionAdapter(API_URL, "wrong-token", UrllibJsonHttpClient())
    denied = wrong_token.create_task(idempotency_key=_key("denied"), title="x", assignee_role="x", description="")
    assert not denied.ok and "status=401" in denied.detail


def test_events_webhook_accepts_only_signed_batches():
    http = UrllibJsonHttpClient()
    batch = {"events": [{"type": "notification.created", "improvement_id": "contract-test-imp",
                         "occurred_at": datetime.now(UTC).isoformat(),
                         "payload": {"notification_id": uuid.uuid4().hex, "kind": "question", "recipient_id": "1",
                                     "title": "Contract test", "body": "test", "severity": "medium"}}]}
    body = json.dumps(batch, sort_keys=True).encode("utf-8")
    signed = http.post_bytes(f"{API_URL}/events", body, {"X-CI-Signature": sign_body(EVENTS_SECRET, body)})
    assert signed.status == 200 and signed.body == {"received": 1}
    redelivered = http.post_bytes(f"{API_URL}/events", body, {"X-CI-Signature": sign_body(EVENTS_SECRET, body)})
    assert redelivered.status == 200  # at-least-once delivery: duplicates are accepted and skipped

    forged = http.post_bytes(f"{API_URL}/events", body, {"X-CI-Signature": sign_body("wrong-secret", body)})
    assert forged.status == 401
