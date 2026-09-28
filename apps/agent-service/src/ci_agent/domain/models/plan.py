"""Improve/Act phase: ActionPlan (hash-protected) and per-step ActionRecord."""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from hashlib import sha256
from typing import Any, Sequence

from ci_agent.domain.errors import IntegrityError


@dataclass(frozen=True)
class PlannedAction:
    type: str  # apply_discount | adjust_inventory | create_task | switch_channel | update_sop_checklist
    params: dict[str, Any]
    description: str = ""


@dataclass(frozen=True)
class MeasurementPlan:
    kpis: tuple[str, ...]
    evaluate_after_days: int
    min_improvement_pct: float = 5.0


def compute_plan_hash(strategy: str, actions: Sequence[PlannedAction]) -> str:
    payload = {"strategy": strategy, "actions": [{"type": a.type, "params": a.params} for a in actions]}
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return sha256(canonical.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class ActionPlan:
    strategy: str
    actions: tuple[PlannedAction, ...]
    measurement_plan: MeasurementPlan
    estimated_cost: float
    plan_hash: str

    @staticmethod
    def create(strategy: str, actions: Sequence[PlannedAction], measurement_plan: MeasurementPlan,
               estimated_cost: float = 0.0) -> "ActionPlan":
        actions_t = tuple(actions)
        return ActionPlan(strategy, actions_t, measurement_plan, estimated_cost,
                          compute_plan_hash(strategy, actions_t))

    def verify(self) -> None:
        if compute_plan_hash(self.strategy, self.actions) != self.plan_hash:
            raise IntegrityError("Action plan changed after it was created")


class ActionStatus(str, Enum):
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    COMPENSATED = "compensated"
    DRY_RUN = "dry_run"


@dataclass
class ActionRecord:
    step: int
    type: str
    idempotency_key: str
    status: ActionStatus
    detail: str = ""
    external_ref: str | None = None
    executed_at: datetime | None = None
