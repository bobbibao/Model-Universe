from __future__ import annotations

from ci_agent.application.commands.base import ActionCommand, register_command
from ci_agent.application.ports.shop import ActionResult, ShopActionPort


@register_command
class ApplyDiscountCommand(ActionCommand):
    type = "apply_discount"

    def execute(self, gateway: ShopActionPort, *, idempotency_key: str, dry_run: bool = False) -> ActionResult:
        p = self.action.params
        return gateway.apply_discount(idempotency_key=idempotency_key, skus=list(p["skus"]),
                                      percent=float(p["percent"]), duration_days=int(p.get("duration_days", 14)),
                                      dry_run=dry_run)


@register_command
class AdjustInventoryCommand(ActionCommand):
    type = "adjust_inventory"

    def execute(self, gateway: ShopActionPort, *, idempotency_key: str, dry_run: bool = False) -> ActionResult:
        p = self.action.params
        return gateway.adjust_inventory(idempotency_key=idempotency_key, sku=p["sku"],
                                        new_status=p["new_status"], reason=p.get("reason", ""), dry_run=dry_run)


@register_command
class CreateTaskCommand(ActionCommand):
    type = "create_task"

    def execute(self, gateway: ShopActionPort, *, idempotency_key: str, dry_run: bool = False) -> ActionResult:
        if dry_run:
            return ActionResult(True, detail="dry run: task would be created")
        p = self.action.params
        return gateway.create_task(idempotency_key=idempotency_key, title=p["title"],
                                   assignee_role=p["assignee_role"], description=p.get("description", ""),
                                   due_in_days=p.get("due_in_days"))


@register_command
class SwitchChannelCommand(ActionCommand):
    type = "switch_channel"

    def execute(self, gateway: ShopActionPort, *, idempotency_key: str, dry_run: bool = False) -> ActionResult:
        p = self.action.params
        return gateway.switch_channel(idempotency_key=idempotency_key, skus=list(p["skus"]),
                                      to_channel=p["to_channel"], dry_run=dry_run)


@register_command
class UpdateSopChecklistCommand(ActionCommand):
    type = "update_sop_checklist"

    def execute(self, gateway: ShopActionPort, *, idempotency_key: str, dry_run: bool = False) -> ActionResult:
        if dry_run:
            return ActionResult(True, detail="dry run: checklist would be updated")
        p = self.action.params
        return gateway.update_sop_checklist(idempotency_key=idempotency_key, sop_id=p["sop_id"],
                                            add_items=list(p["add_items"]))
