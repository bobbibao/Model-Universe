"""Small builders shared by tests, so each test only states what it cares about."""
from __future__ import annotations

from datetime import datetime, timezone

from ci_agent.domain.models.finding import OptionPreview
from ci_agent.domain.models.human import Directive
from ci_agent.domain.models.signal import Severity, Signal, make_fingerprint

NOW = datetime(2026, 1, 5, 9, 0, tzinfo=timezone.utc)


def make_signal(kind: str = "dead_stock", skus: tuple[str, ...] = ("A1", "A2"),
                severity: Severity = Severity.MEDIUM, now: datetime = NOW) -> Signal:
    return Signal(kind=kind, summary=f"test {kind} signal", severity=severity, subject_skus=skus,
                 detected_at=now, fingerprint=make_fingerprint(kind, skus), id="sig-1")


def make_option(strategy: str = "discount", option_id: str = "discount", cost: float = 0.0,
                recovery: float = 1000.0) -> OptionPreview:
    return OptionPreview(option_id=option_id, strategy=strategy, title=f"{strategy} option",
                         params={"percent": 20.0, "duration_days": 14}, est_recovery_value=recovery,
                         est_cost=cost, est_waste_reduction=recovery * 0.5)


def make_directive(strategy: str = "discount", skus: tuple[str, ...] = ("A1", "A2"),
                   params: dict | None = None, limits: dict | None = None, now: datetime = NOW) -> Directive:
    return Directive(strategy=strategy, option_id=strategy, params=params or {"percent": 20.0, "duration_days": 14},
                     limits=limits or {"max_discount_pct": 20.0, "budget_cap": 500.0}, sku_scope=skus,
                     approved_by="user:bob", approved_at=now)
