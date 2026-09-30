"""Explicit JSON mapping for what the agent stores in Postgres (ROADMAP T-02).

Kept in infrastructure on purpose: the domain stays free of persistence concerns, and every field is named here, so
a new domain field that is not mapped fails the round-trip tests instead of silently disappearing.

Contract: `improvement_from_dict(json.loads(json.dumps(improvement_to_dict(i))))` equals `i` except for
`pending_events`, which are transient (the Recorder publishes them after the save; T-07 adds the outbox). In
particular an `ActionPlan` keeps its `plan_hash`, and `verify()` still passes after a reload.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from ci_agent.domain.models.audit import AuditEntry
from ci_agent.domain.models.case import CaseRecord
from ci_agent.domain.models.finding import Cause, Finding, OptionPreview
from ci_agent.domain.models.human import (
    Answer,
    AnswerDecision,
    Directive,
    Question,
    QuestionStatus,
)
from ci_agent.domain.models.improvement import (
    HistoryEntry,
    Improvement,
    ImprovementStatus,
)
from ci_agent.domain.models.measurement import KpiDelta, MeasurementResult, Verdict
from ci_agent.domain.models.notification import ChannelType, DeliveryAttempt
from ci_agent.domain.models.plan import (
    ActionPlan,
    ActionRecord,
    ActionStatus,
    MeasurementPlan,
    PlannedAction,
)
from ci_agent.domain.models.signal import Severity, Signal

PAYLOAD_FORMAT = 1  # bump with a migration when the stored shape changes


def _dt(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _parse_dt(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value is not None else None


def _req_dt(value: str) -> datetime:
    return datetime.fromisoformat(value)


# ------------------------------------------------------------------------------------------------ signal, finding

def signal_to_dict(s: Signal) -> dict[str, Any]:
    return {"id": s.id, "kind": s.kind, "summary": s.summary, "severity": s.severity.value,
            "subject_skus": list(s.subject_skus), "detected_at": _dt(s.detected_at), "fingerprint": s.fingerprint,
            "metrics": dict(s.metrics)}


def signal_from_dict(d: dict[str, Any]) -> Signal:
    return Signal(kind=d["kind"], summary=d["summary"], severity=Severity(d["severity"]),
                  subject_skus=tuple(d["subject_skus"]), detected_at=_req_dt(d["detected_at"]),
                  fingerprint=d["fingerprint"], metrics=dict(d["metrics"]), id=d["id"])


def option_to_dict(o: OptionPreview) -> dict[str, Any]:
    return {"option_id": o.option_id, "strategy": o.strategy, "title": o.title, "params": dict(o.params),
            "est_recovery_value": o.est_recovery_value, "est_cost": o.est_cost,
            "est_waste_reduction": o.est_waste_reduction, "risk": o.risk, "assumptions": list(o.assumptions)}


def option_from_dict(d: dict[str, Any]) -> OptionPreview:
    return OptionPreview(option_id=d["option_id"], strategy=d["strategy"], title=d["title"], params=dict(d["params"]),
                         est_recovery_value=d["est_recovery_value"], est_cost=d["est_cost"],
                         est_waste_reduction=d["est_waste_reduction"], risk=d["risk"],
                         assumptions=tuple(d["assumptions"]))


def finding_to_dict(f: Finding) -> dict[str, Any]:
    return {"signal_id": f.signal_id, "summary": f.summary,
            "causes": [{"description": c.description, "confidence": c.confidence, "evidence": dict(c.evidence)}
                       for c in f.causes],
            "sop_refs": list(f.sop_refs), "similar_case_ids": list(f.similar_case_ids),
            "options": [option_to_dict(o) for o in f.options], "actionable": f.actionable,
            "confidence": f.confidence}


def finding_from_dict(d: dict[str, Any]) -> Finding:
    return Finding(signal_id=d["signal_id"], summary=d["summary"],
                   causes=tuple(Cause(c["description"], c["confidence"], dict(c["evidence"])) for c in d["causes"]),
                   sop_refs=tuple(d["sop_refs"]), similar_case_ids=tuple(d["similar_case_ids"]),
                   options=tuple(option_from_dict(o) for o in d["options"]), actionable=d["actionable"],
                   confidence=d["confidence"])


# ------------------------------------------------------------------------------------------------ ask

def question_to_dict(q: Question) -> dict[str, Any]:
    return {"id": q.id, "improvement_id": q.improvement_id, "prompt": q.prompt, "context": q.context,
            "options": [option_to_dict(o) for o in q.options], "created_at": _dt(q.created_at),
            "expires_at": _dt(q.expires_at), "attempt": q.attempt, "recommended_option_id": q.recommended_option_id,
            "status": q.status.value}


def question_from_dict(d: dict[str, Any]) -> Question:
    return Question(id=d["id"], improvement_id=d["improvement_id"], prompt=d["prompt"], context=d["context"],
                    options=tuple(option_from_dict(o) for o in d["options"]), created_at=_req_dt(d["created_at"]),
                    expires_at=_req_dt(d["expires_at"]), attempt=d["attempt"],
                    recommended_option_id=d["recommended_option_id"], status=QuestionStatus(d["status"]))


def answer_to_dict(a: Answer) -> dict[str, Any]:
    return {"question_id": a.question_id, "decision": a.decision.value, "answered_by": a.answered_by,
            "channel": a.channel, "answered_at": _dt(a.answered_at), "option_id": a.option_id,
            "overrides": dict(a.overrides), "note": a.note}


def answer_from_dict(d: dict[str, Any]) -> Answer:
    return Answer(question_id=d["question_id"], decision=AnswerDecision(d["decision"]), answered_by=d["answered_by"],
                  channel=d["channel"], answered_at=_req_dt(d["answered_at"]), option_id=d["option_id"],
                  overrides=dict(d["overrides"]), note=d["note"])


def directive_to_dict(x: Directive) -> dict[str, Any]:
    return {"strategy": x.strategy, "option_id": x.option_id, "params": dict(x.params), "limits": dict(x.limits),
            "sku_scope": list(x.sku_scope), "approved_by": x.approved_by, "approved_at": _dt(x.approved_at),
            "auto_approved": x.auto_approved}


def directive_from_dict(d: dict[str, Any]) -> Directive:
    return Directive(strategy=d["strategy"], option_id=d["option_id"], params=dict(d["params"]),
                     limits=dict(d["limits"]), sku_scope=tuple(d["sku_scope"]), approved_by=d["approved_by"],
                     approved_at=_req_dt(d["approved_at"]), auto_approved=d["auto_approved"])


# ------------------------------------------------------------------------------------------------ improve, act, measure

def plan_to_dict(p: ActionPlan) -> dict[str, Any]:
    m = p.measurement_plan
    return {"strategy": p.strategy,
            "actions": [{"type": a.type, "params": dict(a.params), "description": a.description} for a in p.actions],
            "measurement_plan": {"kpis": list(m.kpis), "evaluate_after_days": m.evaluate_after_days,
                                 "min_improvement_pct": m.min_improvement_pct},
            "estimated_cost": p.estimated_cost, "plan_hash": p.plan_hash}


def plan_from_dict(d: dict[str, Any]) -> ActionPlan:
    m = d["measurement_plan"]
    # The stored hash is kept as-is (never recomputed here): Act re-verifies it, so tampering is still detected.
    return ActionPlan(strategy=d["strategy"],
                      actions=tuple(PlannedAction(a["type"], dict(a["params"]), a["description"]) for a in d["actions"]),
                      measurement_plan=MeasurementPlan(tuple(m["kpis"]), m["evaluate_after_days"],
                                                       m["min_improvement_pct"]),
                      estimated_cost=d["estimated_cost"], plan_hash=d["plan_hash"])


def record_to_dict(r: ActionRecord) -> dict[str, Any]:
    return {"step": r.step, "type": r.type, "idempotency_key": r.idempotency_key, "status": r.status.value,
            "detail": r.detail, "external_ref": r.external_ref, "executed_at": _dt(r.executed_at)}


def record_from_dict(d: dict[str, Any]) -> ActionRecord:
    return ActionRecord(step=d["step"], type=d["type"], idempotency_key=d["idempotency_key"],
                        status=ActionStatus(d["status"]), detail=d["detail"], external_ref=d["external_ref"],
                        executed_at=_parse_dt(d["executed_at"]))


def measurement_to_dict(m: MeasurementResult) -> dict[str, Any]:
    return {"deltas": [{"name": x.name, "baseline": x.baseline, "current": x.current, "delta_pct": x.delta_pct,
                        "improved": x.improved, "improvement_pct": x.improvement_pct} for x in m.deltas],
            "verdict": m.verdict.value, "measured_at": _dt(m.measured_at), "summary": m.summary}


def measurement_from_dict(d: dict[str, Any]) -> MeasurementResult:
    return MeasurementResult(
        deltas=tuple(KpiDelta(x["name"], x["baseline"], x["current"], x["delta_pct"], x["improved"],
                              x["improvement_pct"]) for x in d["deltas"]),
        verdict=Verdict(d["verdict"]), measured_at=_req_dt(d["measured_at"]), summary=d["summary"])


# ------------------------------------------------------------------------------------------------ the aggregate

def improvement_to_dict(i: Improvement) -> dict[str, Any]:
    """Everything except `pending_events` (transient) and `version` (the row's column is authoritative)."""
    return {
        "format": PAYLOAD_FORMAT, "id": i.id, "signal": signal_to_dict(i.signal), "created_at": _dt(i.created_at),
        "updated_at": _dt(i.updated_at), "status": i.status.value,
        "finding": finding_to_dict(i.finding) if i.finding else None, "finding_stale": i.finding_stale,
        "human_notes": list(i.human_notes), "questions": [question_to_dict(q) for q in i.questions],
        "answers": [answer_to_dict(a) for a in i.answers], "clarification_count": i.clarification_count,
        "directive": directive_to_dict(i.directive) if i.directive else None,
        "plan": plan_to_dict(i.plan) if i.plan else None,
        "action_records": [record_to_dict(r) for r in i.action_records], "action_attempts": i.action_attempts,
        "baseline": dict(i.baseline), "measure_due_at": _dt(i.measure_due_at),
        "measurement": measurement_to_dict(i.measurement) if i.measurement else None, "case_id": i.case_id,
        "history": [{"status": h.status.value, "at": _dt(h.at), "note": h.note} for h in i.history],
    }


def improvement_from_dict(d: dict[str, Any], version: int) -> Improvement:
    if d.get("format") != PAYLOAD_FORMAT:
        raise ValueError(f"Unsupported improvement payload format {d.get('format')!r} (expected {PAYLOAD_FORMAT})")
    return Improvement(
        id=d["id"], signal=signal_from_dict(d["signal"]), created_at=_req_dt(d["created_at"]),
        updated_at=_req_dt(d["updated_at"]), status=ImprovementStatus(d["status"]),
        finding=finding_from_dict(d["finding"]) if d["finding"] else None, finding_stale=d["finding_stale"],
        human_notes=list(d["human_notes"]), questions=[question_from_dict(q) for q in d["questions"]],
        answers=[answer_from_dict(a) for a in d["answers"]], clarification_count=d["clarification_count"],
        directive=directive_from_dict(d["directive"]) if d["directive"] else None,
        plan=plan_from_dict(d["plan"]) if d["plan"] else None,
        action_records=[record_from_dict(r) for r in d["action_records"]], action_attempts=d["action_attempts"],
        baseline=dict(d["baseline"]), measure_due_at=_parse_dt(d["measure_due_at"]),
        measurement=measurement_from_dict(d["measurement"]) if d["measurement"] else None, case_id=d["case_id"],
        history=[HistoryEntry(ImprovementStatus(h["status"]), _req_dt(h["at"]), h["note"]) for h in d["history"]],
        pending_events=[], version=version,
    )


# ------------------------------------------------------------------------------------------------ cases and logs

def case_to_dict(c: CaseRecord) -> dict[str, Any]:
    return {"format": PAYLOAD_FORMAT, "id": c.id, "improvement_id": c.improvement_id, "signal_kind": c.signal_kind,
            "situation": c.situation, "options_considered": list(c.options_considered), "decision": c.decision,
            "outcome_verdict": c.outcome_verdict, "kpi_summary": dict(c.kpi_summary), "lessons": list(c.lessons),
            "created_at": _dt(c.created_at), "tags": list(c.tags)}


def case_from_dict(d: dict[str, Any]) -> CaseRecord:
    if d.get("format") != PAYLOAD_FORMAT:
        raise ValueError(f"Unsupported case payload format {d.get('format')!r} (expected {PAYLOAD_FORMAT})")
    return CaseRecord(id=d["id"], improvement_id=d["improvement_id"], signal_kind=d["signal_kind"],
                      situation=d["situation"], options_considered=tuple(d["options_considered"]),
                      decision=d["decision"], outcome_verdict=d["outcome_verdict"], kpi_summary=dict(d["kpi_summary"]),
                      lessons=tuple(d["lessons"]), created_at=_req_dt(d["created_at"]), tags=tuple(d["tags"]))


def audit_from_row(row: dict[str, Any]) -> AuditEntry:
    return AuditEntry(actor=row["actor"], action=row["action"], at=row["at"], improvement_id=row["improvement_id"],
                      detail=dict(row["detail"]))


def attempt_from_row(row: dict[str, Any]) -> DeliveryAttempt:
    return DeliveryAttempt(notification_id=row["notification_id"], channel=ChannelType(row["channel"]), ok=row["ok"],
                           detail=row["detail"], attempted_at=row["attempted_at"])
