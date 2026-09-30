"""Executes an approved ActionPlan step by step.

- Idempotency: key = improvement + plan hash + attempt + step.
- On failure: stop, compensate already-succeeded steps in reverse order.
- Retry-safe: steps that already succeeded (and were not compensated) are skipped.
"""
from __future__ import annotations

from dataclasses import dataclass

from ci_agent.application.commands.base import build_command
from ci_agent.application.ports.shop import ActionResult, ShopActionPort
from ci_agent.application.ports.system import ClockPort
from ci_agent.domain.models.plan import ActionPlan, ActionRecord, ActionStatus


@dataclass(frozen=True)
class ExecutionOutcome:
    ok: bool
    records: list[ActionRecord]
    error: str | None = None


def idempotency_key(improvement_id: str, plan_hash: str, attempt: int, step: int) -> str:
    return f"{improvement_id}:{plan_hash[:12]}:a{attempt}:s{step}"


class CommandExecutor:
    def __init__(self, gateway: ShopActionPort, clock: ClockPort) -> None:
        self._gateway = gateway
        self._clock = clock

    def execute(self, improvement_id: str, plan: ActionPlan, attempt: int,
                prior: list[ActionRecord] | None = None, dry_run: bool = False) -> ExecutionOutcome:
        records: dict[int, ActionRecord] = {r.step: r for r in (prior or [])}
        for step, action in enumerate(plan.actions):
            existing = records.get(step)
            if existing and existing.status is ActionStatus.SUCCEEDED:
                continue
            key = idempotency_key(improvement_id, plan.plan_hash, attempt, step)
            try:
                result = build_command(action).execute(self._gateway, idempotency_key=key, dry_run=dry_run)
            except Exception as exc:  # adapters may raise on transport errors
                result = ActionResult(False, detail=f"{type(exc).__name__}: {exc}")
            status = (ActionStatus.DRY_RUN if dry_run else ActionStatus.SUCCEEDED) if result.ok \
                else ActionStatus.FAILED
            records[step] = ActionRecord(step, action.type, key, status, result.detail,
                                         result.external_ref, self._clock.now())
            if not result.ok:
                self._compensate(plan, records)
                ordered = [records[k] for k in sorted(records)]
                return ExecutionOutcome(False, ordered, f"step {step} ({action.type}) failed: {result.detail}")
        return ExecutionOutcome(True, [records[k] for k in sorted(records)])

    def _compensate(self, plan: ActionPlan, records: dict[int, ActionRecord]) -> None:
        for step in sorted(records, reverse=True):
            rec = records[step]
            if rec.status is not ActionStatus.SUCCEEDED:
                continue
            try:
                result = build_command(plan.actions[step]).compensate(self._gateway, idempotency_key=rec.idempotency_key)
            except Exception as exc:
                result = ActionResult(False, detail=str(exc))
            if result.ok:
                rec.status = ActionStatus.COMPENSATED
                rec.detail = (rec.detail + " | compensated").strip(" |")
            else:
                rec.detail = (rec.detail + f" | COMPENSATION FAILED: {result.detail}").strip(" |")
