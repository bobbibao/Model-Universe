"""ShopActionPort over HTTP: calls the web app's Agent API (packages/contracts/openapi/web-agent-api.yaml).

Every call carries `Authorization: Bearer <service token>` and `Idempotency-Key`. The web app must
apply each key at most once and answer 409 when a key is reused with a different payload.
"""
from __future__ import annotations

from typing import Any
from urllib.parse import quote

from ci_agent.application.ports.shop import ActionResult
from ci_agent.infrastructure.http.client import JsonHttpClient


class HttpShopActionAdapter:
    def __init__(self, base_url: str, token: str, http: JsonHttpClient) -> None:
        self._base, self._token, self._http = base_url.rstrip("/"), token, http

    def _post(self, path: str, key: str, payload: dict[str, Any]) -> ActionResult:
        resp = self._http.post_json(f"{self._base}{path}", payload,
                                    {"Authorization": f"Bearer {self._token}", "Idempotency-Key": key})
        if resp.status == 200:
            return ActionResult(True, resp.body.get("ref"), resp.body.get("detail", ""))
        return ActionResult(False, detail=f"shop API status={resp.status} {resp.body}")

    def adjust_inventory(self, *, idempotency_key: str, sku: str, new_status: str, reason: str,
                         dry_run: bool = False) -> ActionResult:
        return self._post("/inventory/adjustments", idempotency_key,
                          {"sku": sku, "new_status": new_status, "reason": reason, "dry_run": dry_run})

    def apply_discount(self, *, idempotency_key: str, skus: list[str], percent: float, duration_days: int,
                       dry_run: bool = False) -> ActionResult:
        return self._post("/pricing/discounts", idempotency_key,
                          {"skus": skus, "percent": percent, "duration_days": duration_days, "dry_run": dry_run})

    def create_task(self, *, idempotency_key: str, title: str, assignee_role: str, description: str,
                    due_in_days: int | None = None) -> ActionResult:
        return self._post("/tasks", idempotency_key, {"title": title, "assignee_role": assignee_role,
                                                      "description": description, "due_in_days": due_in_days})

    def switch_channel(self, *, idempotency_key: str, skus: list[str], to_channel: str,
                       dry_run: bool = False) -> ActionResult:
        return self._post("/channels/switch", idempotency_key,
                          {"skus": skus, "to_channel": to_channel, "dry_run": dry_run})

    def update_sop_checklist(self, *, idempotency_key: str, sop_id: str, add_items: list[str]) -> ActionResult:
        return self._post("/sop/checklists", idempotency_key, {"sop_id": sop_id, "add_items": add_items})

    def revert(self, *, idempotency_key: str, of_key: str) -> ActionResult:
        return self._post(f"/actions/{quote(of_key, safe='')}/revert", idempotency_key, {})
