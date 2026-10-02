"""The closed improvement loop for one opportunity (docs/ARCHITECTURE.md section 6.1), one thread each.

    investigate -> validate -> review -> capture_baseline -> execute ... (idle until due) ... measure -> learn -> close

- `investigate` is the only step with a planning model (read-only tools); `learn` uses the worker model for lessons.
- `validate` rebuilds every option from its strategy and parameters: complete Agent API bodies, idempotency keys
  `{thread_id}:{option_id}:{n}`, recomputed estimates, limits, risk tier and autonomy route.
- `review` runs a low-risk option under `auto_low`, records a `shadow` one, and otherwise interrupts for a person's
  decision (approve, edit, reject, respond; the sweep resumes stale reviews with `expire`).
- `execute` sends the approved bodies verbatim with their keys and the approval grant, retries retryable failures
  by re-running the node (same keys, so nothing applies twice) and compensates in reverse order on a final failure.
- A run on a thread that is `measuring` enters at `measure`: the monitor wakes it with `{"wake": "followup_due"}`
  when the follow-up is due (an empty input would only continue the last checkpoint).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import asdict
from datetime import datetime, timedelta
from typing import Any, Literal, TypedDict

from langchain_core.messages import HumanMessage
from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime
from langgraph.store.base import BaseStore
from langgraph.types import Command, RetryPolicy, interrupt
from pydantic import BaseModel, Field, ValidationError

from shop_agent import llm, wiring
from shop_agent.agents.investigator import (
    OptionChoice,
    Proposal,
    facts_message,
    investigate,
    menu_entry,
    tools_called,
)
from shop_agent.agents.kinds import get_kind
from shop_agent.agents.learner import write_lessons
from shop_agent.config import get_settings
from shop_agent.domain.actions import ActionSpec, apply_edits, to_spec
from shop_agent.domain.capabilities import RiskTier
from shop_agent.domain.growth.policies import ShopState, check_option, state_from_snapshot
from shop_agent.domain.measurement import evaluate
from shop_agent.domain.models import Opportunity
from shop_agent.domain.options import DO_NOTHING, STRATEGIES, OptionNotApplicable, menu
from shop_agent.domain.policies.autonomy import Route
from shop_agent.domain.policies.autonomy import route as autonomy_route
from shop_agent.domain.policies.limits import action_violations, check_action, option_violations
from shop_agent.logging import get_logger
from shop_agent.tools.deps import ShopDeps, configure, get_deps

logger = get_logger(__name__)

configure(wiring.default_deps)
llm.preload(llm.ModelRole.PLANNER, llm.ModelRole.WORKER)

FOLLOWUPS = ("followups",)
CASES = ("cases",)
SIGNALS = ("signals",)
MAX_RESPONDS = 3
MAX_VALIDATION_RETRIES = 1
EXECUTE_ATTEMPTS = 3

Stage = Literal["new", "investigating", "reviewing", "acting", "measuring", "learning", "closed"]
Outcome = Literal["measured", "rejected", "expired", "failed", "blocked", "no_viable_option", "shadow", "do_nothing"]
DecisionType = Literal["approve", "edit", "reject", "respond", "expire"]
DECISIONS: tuple[DecisionType, ...] = ("approve", "edit", "reject", "respond")
EDIT_RULE = "each field in args is applied to every action of the option that lists it in editable_fields"


# ------------------------------------------------------------------------------------------------ state


class ValidatedOption(BaseModel):
    option_id: str
    strategy: str
    title: str
    rationale: str = ""
    params: dict[str, Any] = Field(default_factory=dict)
    estimate: dict[str, Any] = Field(default_factory=dict)
    actions: list[ActionSpec] = Field(default_factory=list)
    tier: RiskTier = RiskTier.LOW
    route: Route = Route.ASK
    route_reason: str = ""
    violations: list[str] = Field(default_factory=list)

    @property
    def viable(self) -> bool:
        return not self.violations and self.route is not Route.BLOCKED


class Decision(BaseModel):
    """A person's (or the autonomy policy's) answer to a review. `grant` is the web's signed approval grant."""

    type: DecisionType
    option_id: str | None = None
    args: dict[str, Any] = Field(default_factory=dict)
    note: str | None = None
    approver: str | None = None
    grant: str | None = None
    mode: Literal["human", "auto"] = "human"


class Step(BaseModel):
    action_id: str
    type: str
    endpoint: str
    idempotency_key: str
    ok: bool
    status_code: int | None = None
    error_code: str | None = None
    detail: str = ""
    ref: str | None = None
    reverted: bool = False


class State(TypedDict, total=False):
    stage: Stage
    wake: str  # why a run on an existing thread started (e.g. "followup_due"); START routes on `stage`
    opportunity: dict[str, Any]
    proposal: dict[str, Any]
    tools_used: list[str]
    investigations: int
    validation_retries: int
    responses: list[str]
    problems: list[str]
    options: list[dict[str, Any]]
    recommended_option_id: str
    review_expires_at: str
    review_error: str | None
    decision: dict[str, Any]
    approved: list[dict[str, Any]]
    baseline: dict[str, float]
    acted_at: str
    steps: list[dict[str, Any]]
    followup_due_at: str
    measurement: dict[str, Any]
    outcome: Outcome
    lessons: list[str]
    case_key: str


class StepRetry(Exception):
    """A write failed in a way worth retrying (network, 5xx); the node re-runs and replays earlier steps by key."""


def _thread_id(runtime: Runtime[Any]) -> str:
    info = runtime.execution_info
    return (info.thread_id if info else None) or "local"


def _store(runtime: Runtime[Any]) -> BaseStore:
    if runtime.store is None:
        raise RuntimeError("the improvement graph needs a Store (the Agent Server provides one)")
    return runtime.store


def _opportunity(state: State) -> Opportunity:
    return Opportunity.model_validate(state["opportunity"])


def _options(state: State) -> list[ValidatedOption]:
    return [ValidatedOption.model_validate(o) for o in state.get("options", [])]


def _dump(models: list[Any]) -> list[dict[str, Any]]:
    return [m.model_dump(mode="json") for m in models]


# ------------------------------------------------------------------------------------------------ entry


def route_entry(state: State) -> str:
    stage = state.get("stage", "new")
    if stage in ("new", "investigating"):
        return "investigate"
    if stage == "measuring":
        return "measure"
    return END


# ------------------------------------------------------------------------------------------------ investigate


async def investigation_message(
    opportunity: Opportunity, deps: ShopDeps, *, responses: Sequence[str] = (), problems: Sequence[str] = ()
) -> HumanMessage:
    """The investigator's input: the opportunity, the menu of strategies with computed estimates, the limits."""
    now = deps.clock()
    snapshot = await deps.reader.snapshot(now)
    offered = [menu_entry(plan, STRATEGIES[plan.strategy].title) for plan in menu(opportunity, snapshot, now)]
    limits = {
        "max_discount_pct": deps.limits.max_discount_pct,
        "max_skus_per_option": deps.limits.max_skus_per_option,
        "max_option_cost_vnd": deps.limits.max_option_cost_vnd,
    }
    return facts_message(opportunity, offered, limits, responses, problems)


async def investigate_node(state: State, runtime: Runtime[Any]) -> State:
    deps = await get_deps(runtime)
    opportunity = _opportunity(state)
    message = await investigation_message(
        opportunity, deps, responses=state.get("responses", []), problems=state.get("problems", [])
    )
    proposal, messages = await investigate(
        get_kind(opportunity.kind), message, context=deps, script_key=f"improvement.investigate.{opportunity.kind}"
    )
    return {
        "stage": "investigating",
        "proposal": proposal.model_dump(mode="json"),
        "tools_used": [*state.get("tools_used", []), *tools_called(messages)],
        "investigations": state.get("investigations", 0) + 1,
    }


# ------------------------------------------------------------------------------------------------ validate


def _unique_id(wanted: str, taken: set[str]) -> str:
    base = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in wanted.lower())[:40].strip("-") or "option"
    option_id, n = base, 2
    while option_id in taken:
        option_id, n = f"{base}-{n}", n + 1
    taken.add(option_id)
    return option_id


def validate_options(
    proposal: Proposal,
    opportunity: Opportunity,
    deps: ShopDeps,
    snapshot: Any,
    now: datetime,
    thread_id: str,
    shop_state: ShopState,
) -> tuple[list[ValidatedOption], dict[str, str]]:
    """Every proposed option rebuilt by code; returns the options and the model's option ids mapped to ours.

    Each option's actions are also run through the web's rules (`check_option`) over the shop's current state, so an
    option the web would refuse is blocked here rather than failing at act.
    """
    spec = get_kind(opportunity.kind)
    choices = list(proposal.options)
    if not any(c.strategy == DO_NOTHING for c in choices):
        choices.append(OptionChoice(option_id=DO_NOTHING, strategy=DO_NOTHING, rationale=""))
    taken: set[str] = set()
    ids: dict[str, str] = {}
    options: list[ValidatedOption] = []
    for choice in choices:
        option_id = _unique_id(choice.option_id or choice.strategy, taken)
        ids.setdefault(choice.option_id, option_id)
        strategy = STRATEGIES.get(choice.strategy)
        option = ValidatedOption(
            option_id=option_id,
            strategy=choice.strategy,
            title=strategy.title if strategy else choice.strategy,
            rationale=choice.rationale,
        )
        try:
            plan = spec.validate(choice.strategy, choice.params(), opportunity, snapshot, now)
        except (OptionNotApplicable, ValueError) as exc:
            option.violations = [str(exc)]
            option.route, option.tier = Route.BLOCKED, RiskTier.BLOCKED
            options.append(option)
            continue
        actions = [
            to_spec(draft, action_id=f"{option_id}-{n}", idempotency_key=f"{thread_id}:{option_id}:{n}")
            for n, draft in enumerate(plan.actions, 1)
        ]
        e = plan.estimate
        option.params = plan.params
        option.estimate = {
            "recovery_vnd": e.recovery_vnd,
            "cost_vnd": e.cost_vnd,
            "waste_reduction_vnd": e.waste_reduction_vnd,
            "net_vnd": e.net_vnd,
            "risk": e.risk,
            "assumptions": list(e.assumptions),
        }
        option.actions = actions
        not_allowed = sorted({a.type for a in actions} - spec.action_types)
        option.violations = [f"action {t} is not allowed for {opportunity.kind}" for t in not_allowed]
        option.violations += option_violations(actions, e, deps.limits)
        tier = spec.risk_tier(actions, e, opportunity.severity)
        route, reason = autonomy_route([(c, tier) for a in actions for c in a.capabilities], deps.autonomy)
        check = check_option(actions, shop_state, auto=route is Route.AUTO)
        option.violations += list(check.problems)
        if check.needs_person and route is Route.AUTO:
            route, reason = Route.ASK, "the web's low-risk caps need a person for this option"
        option.tier = RiskTier.BLOCKED if option.violations else tier
        option.route, option.route_reason = (
            (Route.BLOCKED, "blocked by a limit") if option.violations else (route, reason)
        )
        options.append(option)
    return options, ids


async def validate_node(state: State, runtime: Runtime[Any]) -> Command[Literal["review", "investigate", "learn"]]:
    deps = await get_deps(runtime)
    opportunity = _opportunity(state)
    now = deps.clock()
    snapshot = await deps.reader.snapshot(now)
    shop_state = state_from_snapshot(await deps.reader.growth_snapshot(now))
    proposal = Proposal.model_validate(state["proposal"])
    options, ids = validate_options(proposal, opportunity, deps, snapshot, now, _thread_id(runtime), shop_state)
    actionable = [o for o in options if o.viable and o.strategy != DO_NOTHING]
    if not actionable:
        problems = [f"{o.option_id} ({o.strategy}): {v}" for o in options for v in o.violations]
        retries = state.get("validation_retries", 0)
        if retries < MAX_VALIDATION_RETRIES:
            update: State = {"options": _dump(options), "problems": problems, "validation_retries": retries + 1}
            return Command(goto="investigate", update=update)
        return Command(
            goto="learn",
            update={
                "options": _dump(options),
                "problems": problems,
                "outcome": "no_viable_option",
                "stage": "learning",
            },
        )
    recommended = ids.get(proposal.recommended_option_id)
    if recommended not in {o.option_id for o in options if o.viable}:
        recommended = actionable[0].option_id
    expires_at = now + timedelta(hours=get_settings().approval_ttl_hours)
    return Command(
        goto="review",
        update={
            "options": _dump(options),
            "recommended_option_id": recommended,
            "stage": "reviewing",
            "review_expires_at": expires_at.isoformat(),
            "review_error": None,
        },
    )


# ------------------------------------------------------------------------------------------------ review


def review_payload(state: State, options: list[ValidatedOption], thread_id: str) -> dict[str, Any]:
    """What the console shows: everything needed to decide, and to sign a grant over the exact bodies."""
    opportunity = _opportunity(state)
    proposal = state.get("proposal", {})
    responses = state.get("responses", [])
    return {
        "type": "proposal_review",
        "thread_id": thread_id,
        "kind": opportunity.kind,
        "title": opportunity.title,
        "severity": opportunity.severity.value,
        "summary": proposal.get("summary", ""),
        "causes": proposal.get("causes", []),
        "sop_refs": proposal.get("sop_refs", []),
        "options": [
            {
                "option_id": o.option_id,
                "strategy": o.strategy,
                "title": o.title,
                "rationale": o.rationale,
                "params": o.params,
                "estimate": o.estimate,
                "tier": o.tier.value,
                "actions": [
                    {**a.model_dump(mode="json"), "endpoint": a.endpoint, "editable_fields": list(a.editable_fields)}
                    for a in o.actions
                ],
            }
            for o in options
        ],
        "recommended_option_id": state.get("recommended_option_id"),
        "allowed_decisions": [d for d in DECISIONS if d != "respond" or len(responses) < MAX_RESPONDS],
        "edit_rule": EDIT_RULE,
        "expires_at": state.get("review_expires_at"),
        "error": state.get("review_error"),
    }


async def review_node(
    state: State, runtime: Runtime[Any]
) -> Command[Literal["capture_baseline", "investigate", "learn", "review"]]:
    options = [o for o in _options(state) if o.viable]
    by_id = {o.option_id: o for o in options}
    recommended = by_id[state["recommended_option_id"]]
    if not state.get("review_error"):
        if recommended.route is Route.AUTO:
            decision = Decision(
                type="approve", option_id=recommended.option_id, approver="policy:auto_low", mode="auto"
            )
            return _approved(decision, recommended.actions)
        if recommended.route is Route.SHADOW:
            decision = Decision(type="approve", option_id=recommended.option_id, approver="policy:shadow", mode="auto")
            update: State = {"decision": decision.model_dump(), "outcome": "shadow", "stage": "learning"}
            return Command(goto="learn", update=update)

    raw = interrupt(review_payload(state, options, _thread_id(runtime)))

    try:
        decision = Decision.model_validate(raw)
    except ValidationError as exc:
        return _invalid(f"invalid decision: {exc.errors()[0]['msg']}")
    if decision.type in ("reject", "expire"):
        outcome: Outcome = "rejected" if decision.type == "reject" else "expired"
        return Command(
            goto="learn", update={"decision": decision.model_dump(), "outcome": outcome, "stage": "learning"}
        )
    if decision.type == "respond":
        responses = state.get("responses", [])
        if len(responses) >= MAX_RESPONDS:
            return _invalid(f"at most {MAX_RESPONDS} responses; approve, edit or reject")
        if not decision.note:
            return _invalid("respond needs a note")
        return Command(
            goto="investigate",
            update={"responses": [*responses, decision.note], "stage": "investigating", "review_error": None},
        )
    option = by_id.get(decision.option_id or recommended.option_id)
    if option is None:
        return _invalid(f"unknown option {decision.option_id!r}")
    if option.strategy == DO_NOTHING:
        return Command(
            goto="learn", update={"decision": decision.model_dump(), "outcome": "do_nothing", "stage": "learning"}
        )
    try:
        actions = apply_edits(option.actions, decision.args) if decision.type == "edit" else option.actions
        deps = await get_deps(runtime)
        for action in actions:
            check_action(action, deps.limits)
    except ValidationError as exc:
        return _invalid(f"invalid edit: {exc.errors()[0]['msg']}")
    except ValueError as exc:  # LimitExceeded, or a field that cannot be edited
        return _invalid(str(exc))
    return _approved(decision.model_copy(update={"option_id": option.option_id}), actions)


def _approved(decision: Decision, actions: list[ActionSpec]) -> Command[Any]:
    update: State = {
        "decision": decision.model_dump(),
        "approved": _dump(actions),
        "stage": "acting",
        "review_error": None,
    }
    return Command(goto="capture_baseline", update=update)


def _invalid(message: str) -> Command[Any]:
    return Command(goto="review", update={"review_error": message})


# ------------------------------------------------------------------------------------------------ act


async def capture_baseline_node(state: State, runtime: Runtime[Any]) -> State:
    """KPIs just before the first write, checkpointed on their own so a retried act keeps the same baseline."""
    deps = await get_deps(runtime)
    spec = get_kind(_opportunity(state).kind)
    now = deps.clock()
    baseline = await deps.reader.kpis(spec.measurement.kpis, now)
    return {"baseline": baseline, "acted_at": now.isoformat(), "stage": "acting"}


async def execute_node(state: State, runtime: Runtime[Any]) -> Command[str]:
    deps = await get_deps(runtime)
    thread_id = _thread_id(runtime)
    opportunity = _opportunity(state)
    decision = Decision.model_validate(state["decision"])
    actions = [ActionSpec.model_validate(a) for a in state["approved"]]
    problems = [p for action in actions for p in action_violations(action, deps.limits)]
    if problems:
        return Command(goto="learn", update={"problems": problems, "outcome": "blocked", "stage": "learning"})

    context = {
        "thread_id": thread_id,
        "option_id": decision.option_id,
        "approver": decision.approver,
        "approval_mode": decision.mode,
        "model_profile": deps.model_profile,
    }
    attempt = runtime.execution_info.node_attempt if runtime.execution_info else EXECUTE_ATTEMPTS
    steps: list[Step] = []
    for action in actions:
        result = await deps.writer.execute(
            action, grant=decision.grant, context={**context, "action_id": action.action_id}
        )
        steps.append(
            Step(
                action_id=action.action_id,
                type=action.type,
                endpoint=action.endpoint,
                idempotency_key=action.idempotency_key,
                ok=result.ok,
                status_code=result.status_code,
                error_code=result.error_code,
                detail=result.detail,
                ref=result.ref,
            )
        )
        if result.ok:
            continue
        if result.retryable and attempt < EXECUTE_ATTEMPTS:
            raise StepRetry(f"{action.idempotency_key}: {result.detail}")
        for step in reversed(steps[:-1]):
            undo = await deps.writer.revert(
                step.idempotency_key, idempotency_key=f"{step.idempotency_key}:revert", context=context
            )
            step.reverted = undo.ok
        logger.warning("act failed; earlier steps compensated", thread_id=thread_id, step=action.idempotency_key)
        return Command(goto="learn", update={"steps": _dump(steps), "outcome": "failed", "stage": "learning"})

    now = deps.clock()
    demo_minutes = get_settings().demo_measure_after_minutes
    wait = (
        timedelta(minutes=demo_minutes)
        if demo_minutes is not None
        else timedelta(days=get_kind(opportunity.kind).measurement.evaluate_after_days)
    )
    due = now + wait
    await _store(runtime).aput(
        FOLLOWUPS, thread_id, {"thread_id": thread_id, "kind": opportunity.kind, "due_at": due.isoformat()}, index=False
    )
    return Command(goto=END, update={"steps": _dump(steps), "followup_due_at": due.isoformat(), "stage": "measuring"})


# ------------------------------------------------------------------------------------------------ measure, learn


async def measure_node(state: State, runtime: Runtime[Any]) -> Command[str]:
    deps = await get_deps(runtime)
    now = deps.clock()
    due = state.get("followup_due_at")
    if due and now < datetime.fromisoformat(due):
        return Command(goto=END)  # woken early: the follow-up stays and the monitor wakes it again when due
    plan = get_kind(_opportunity(state).kind).measurement
    current = await deps.reader.kpis(plan.kpis, now)
    result = evaluate(plan, state.get("baseline", {}), current, now)
    await _store(runtime).adelete(FOLLOWUPS, _thread_id(runtime))
    measurement = {
        "verdict": result.verdict.value,
        "summary": result.summary,
        "measured_at": now.isoformat(),
        "deltas": [asdict(d) for d in result.deltas],
    }
    return Command(goto="learn", update={"measurement": measurement, "outcome": "measured", "stage": "learning"})


def case_text(state: State) -> str:
    """The facts of the case, assembled by code (the model adds lessons only)."""
    opportunity = _opportunity(state)
    decision = state.get("decision") or {}
    option = next((o for o in state.get("options", []) if o["option_id"] == decision.get("option_id")), None)
    lines = [
        f"kind: {opportunity.kind}",
        f"opportunity: {opportunity.summary}",
        f"outcome: {state.get('outcome', 'unknown')}",
    ]
    if option:
        lines.append(f"option: {option['strategy']} {option['params']}")
    if decision:
        lines.append(
            f"decision: {decision.get('type')} by {decision.get('approver') or 'unknown'} ({decision.get('mode')})"
        )
        if decision.get("args"):
            lines.append(f"edited: {decision['args']}")
        if decision.get("note"):
            lines.append(f"owner note: {decision['note']}")
    lines += [f"owner response: {r}" for r in state.get("responses", [])]
    lines += [f"problem: {p}" for p in state.get("problems", [])]
    failed = [s for s in state.get("steps", []) if not s["ok"]]
    lines += [f"failed step: {s['endpoint']} {s['status_code']} {s['detail']}" for s in failed]
    measurement = state.get("measurement")
    if measurement:
        lines.append(f"result: {measurement['verdict']}; {measurement['summary']}")
    return "\n".join(lines)


async def learn_node(state: State, runtime: Runtime[Any]) -> State:
    deps = await get_deps(runtime)
    opportunity = _opportunity(state)
    thread_id = _thread_id(runtime)
    facts = case_text(state)
    lessons = await write_lessons(facts, script_key="improvement.learn")
    decision = state.get("decision") or {}
    option = next((o for o in state.get("options", []) if o["option_id"] == decision.get("option_id")), None)
    case = {
        "text": facts + ("\nlessons:\n" + "\n".join(f"- {lesson}" for lesson in lessons) if lessons else ""),
        "kind": opportunity.kind,
        "outcome": state.get("outcome"),
        "verdict": (state.get("measurement") or {}).get("verdict"),
        "strategy": option["strategy"] if option else None,
        "thread_id": thread_id,
        "lessons": lessons,
        "closed_at": deps.clock().isoformat(),
    }
    await _store(runtime).aput((*CASES, opportunity.kind), thread_id, case)
    return {"lessons": lessons, "case_key": thread_id, "stage": "learning"}


async def close_node(state: State, runtime: Runtime[Any]) -> State:
    """Closed: the fingerprint's cooldown starts now (the monitor may open it again after it)."""
    deps = await get_deps(runtime)
    store = _store(runtime)
    fingerprint = _opportunity(state).fingerprint
    item = await store.aget(SIGNALS, fingerprint)
    if item is not None:
        await store.aput(SIGNALS, fingerprint, {**item.value, "closed_at": deps.clock().isoformat()}, index=False)
    return {"stage": "closed"}


# ------------------------------------------------------------------------------------------------ graph


def build() -> StateGraph[State, Any, State, State]:
    builder: StateGraph[State, Any, State, State] = StateGraph(State)
    builder.add_node("investigate", investigate_node)
    builder.add_node("validate", validate_node)
    builder.add_node("review", review_node)
    builder.add_node("capture_baseline", capture_baseline_node)
    builder.add_node(
        "execute",
        execute_node,
        retry_policy=RetryPolicy(max_attempts=EXECUTE_ATTEMPTS, initial_interval=0.5, retry_on=StepRetry),
    )
    builder.add_node("measure", measure_node)
    builder.add_node("learn", learn_node)
    builder.add_node("close", close_node)
    builder.add_conditional_edges(START, route_entry, ["investigate", "measure", END])
    builder.add_edge("investigate", "validate")
    builder.add_edge("capture_baseline", "execute")
    builder.add_edge("learn", "close")
    builder.add_edge("close", END)
    return builder


graph = build().compile(name="improvement")
