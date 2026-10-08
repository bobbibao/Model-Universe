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
- Growth kinds (docs/GROWTH_AGENT.md): validate also lints the copy and asks the brand judge (the planner revises up to
  twice, then the option needs a person); the follow-up is due after the flight plus the measurement window; measure
  compares with what would have happened (`domain.growth.measurement`), records the outcome on the web and moves the
  lever priors. A thread opened in `learning` (an incident review after a protective action) only learns.
"""

from __future__ import annotations

import json
import os
import signal
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
from shop_agent.adapters.growth_files import BASE_PRIORS, BRAND_POLICY, GROWTH_DEFAULTS
from shop_agent.agents.brand_judge import judge_copy
from shop_agent.agents.investigator import (
    OptionChoice,
    Proposal,
    facts_message,
    investigate,
    menu_entry,
    tools_called,
)
from shop_agent.agents.kinds import Facts, get_kind
from shop_agent.agents.learner import write_lessons
from shop_agent.config import get_settings
from shop_agent.domain.actions import ActionSpec, apply_edits, to_spec
from shop_agent.domain.capabilities import Capability, RiskTier
from shop_agent.domain.growth import marketing
from shop_agent.domain.growth.defaults import Prior, Priors
from shop_agent.domain.growth.learning import learn_priors, observe
from shop_agent.domain.growth.measurement import measure_growth
from shop_agent.domain.growth.policies import ShopState, check_option, state_from_snapshot
from shop_agent.domain.growth.snapshot import vn_date
from shop_agent.domain.growth.strategies import copy_problems, copy_texts
from shop_agent.domain.measurement import evaluate
from shop_agent.domain.models import Opportunity
from shop_agent.domain.options import DO_NOTHING, OptionNotApplicable
from shop_agent.domain.policies.autonomy import Route
from shop_agent.domain.policies.autonomy import route as autonomy_route
from shop_agent.domain.policies.limits import action_violations, check_action, option_violations
from shop_agent.logging import get_logger
from shop_agent.tools.deps import ShopDeps, configure, get_deps

logger = get_logger(__name__)

configure(wiring.default_deps)
llm.preload(llm.ModelRole.PLANNER, llm.ModelRole.JUDGE, llm.ModelRole.WORKER)

FOLLOWUPS = ("followups",)
CASES = ("cases",)
SIGNALS = ("signals",)
GROWTH = ("growth",)  # the learned lever priors, key "priors"
PRIORS_KEY = "priors"
MAX_RESPONDS = 3
MAX_VALIDATION_RETRIES = 1
MAX_BRAND_REVISIONS = 2
# The capability whose outcome carries an option's figures (the costliest lever); the others record the verdict.
PRIMARY_ORDER = (Capability.ADS_META, Capability.ADS_GOOGLE, Capability.ADS_TIKTOK, Capability.PROMOTION)
EXECUTE_ATTEMPTS = 3

Stage = Literal["new", "investigating", "reviewing", "acting", "measuring", "learning", "closed"]
Outcome = Literal[
    "measured", "rejected", "expired", "failed", "blocked", "no_viable_option", "shadow", "do_nothing", "incident"
]
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
    needs_human: bool = False  # the brand judge failed it twice: never runs without a person
    brand: dict[str, Any] = Field(default_factory=dict)  # lint problems and judge scores (growth copy)

    @property
    def viable(self) -> bool:
        return not self.violations and self.route is not Route.BLOCKED

    @property
    def total_vnd(self) -> int:
        """The money the option commits: ad spend plus discount exposure (growth), or its cost (operations). A person
        approving a high-tier option types it."""
        e = self.estimate
        return int(e.get("spend_vnd", 0)) + int(e.get("discount_cost_vnd", 0)) + int(e.get("cost_vnd", 0))


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
    brand_revisions: int
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
    if stage == "learning":  # an incident review: opened to learn from a protective action
        return "learn"
    return END


# ------------------------------------------------------------------------------------------------ facts


async def current_priors(store: BaseStore | None) -> Priors:
    """The lever priors: the file's, moved by every measured outcome so far."""
    item = await store.aget(GROWTH, PRIORS_KEY) if store is not None else None
    if item is None:
        return BASE_PRIORS
    return BASE_PRIORS.with_values({name: Prior.model_validate(v) for name, v in item.value.items()})


async def load_facts(deps: ShopDeps, thread_id: str, store: BaseStore | None) -> Facts:
    now = deps.clock()
    shop = await deps.reader.snapshot(now)
    growth = await deps.reader.growth_snapshot(now)
    return Facts(shop, growth, thread_id, now, await current_priors(store))


# ------------------------------------------------------------------------------------------------ investigate


def investigation_message(
    opportunity: Opportunity,
    deps: ShopDeps,
    facts: Facts,
    *,
    responses: Sequence[str] = (),
    problems: Sequence[str] = (),
) -> HumanMessage:
    """The investigator's input: the opportunity, the menu of strategies with computed estimates, the limits."""
    planner = get_kind(opportunity.kind).planner
    offered = [menu_entry(plan, planner.title(plan.strategy)) for plan in planner.menu(opportunity, facts)]
    return facts_message(opportunity, offered, planner.limits(facts, deps.limits), responses, problems)


async def investigate_node(state: State, runtime: Runtime[Any]) -> State:
    deps = await get_deps(runtime)
    opportunity = _opportunity(state)
    facts = await load_facts(deps, _thread_id(runtime), runtime.store)
    message = investigation_message(
        opportunity, deps, facts, responses=state.get("responses", []), problems=state.get("problems", [])
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
    proposal: Proposal, opportunity: Opportunity, deps: ShopDeps, facts: Facts, shop_state: ShopState
) -> tuple[list[ValidatedOption], dict[str, str]]:
    """Every proposed option rebuilt by code; returns the options and the model's option ids mapped to ours.

    Each option's actions are also run through the web's rules (`check_option`) over the shop's current state, so an
    option the web would refuse is blocked here rather than failing at act.
    """
    spec = get_kind(opportunity.kind)
    planner = spec.planner
    autonomy = planner.autonomy(facts, deps.autonomy)
    choices = list(proposal.options)
    if not any(c.strategy == DO_NOTHING for c in choices):
        choices.append(OptionChoice(option_id=DO_NOTHING, strategy=DO_NOTHING, rationale=""))
    taken: set[str] = set()
    ids: dict[str, str] = {}
    options: list[ValidatedOption] = []
    for choice in choices:
        option_id = _unique_id(choice.option_id or choice.strategy, taken)
        ids.setdefault(choice.option_id, option_id)
        option = ValidatedOption(
            option_id=option_id,
            strategy=choice.strategy,
            title=planner.title(choice.strategy),
            rationale=choice.rationale,
        )
        try:
            plan = planner.plan(option_id, choice.strategy, choice.params(), opportunity, facts)
            actions = [
                to_spec(draft, action_id=f"{option_id}-{n}", idempotency_key=f"{facts.thread_id}:{option_id}:{n}")
                for n, draft in enumerate(plan.actions, 1)
            ]
        except (OptionNotApplicable, ValueError) as exc:
            option.violations = [str(exc)]
            option.route, option.tier = Route.BLOCKED, RiskTier.BLOCKED
            options.append(option)
            continue
        option.params = plan.params
        option.estimate = plan.estimate.as_dict()
        option.actions = actions
        not_allowed = sorted({a.type for a in actions} - spec.action_types)
        option.violations = [f"action {t} is not allowed for {opportunity.kind}" for t in not_allowed]
        option.violations += option_violations(actions, plan.estimate, deps.limits)
        tier = planner.tier(actions, plan, opportunity, facts)
        route, reason = autonomy_route([(c, tier) for a in actions for c in a.capabilities], autonomy)
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


async def brand_review(options: list[ValidatedOption], facts: Facts) -> dict[str, list[str]]:
    """Lint every viable option's copy, then ask the brand judge about copy that passed; returns the failures."""
    failed: dict[str, list[str]] = {}
    for option in options:
        texts = copy_texts(option.actions)
        if not option.viable or not texts:
            continue
        lint = copy_problems(option.actions, facts.growth, BRAND_POLICY)
        if lint:
            option.brand = {"lint": lint, "passed": False}
            failed[option.option_id] = lint
            continue
        numbers = [a.body for a in option.actions if a.type != "create_campaign"]
        verdict = await judge_copy(texts, json.dumps(numbers, ensure_ascii=False), script_key="improvement.brand_judge")
        option.brand = {"lint": [], "scores": [s.model_dump() for s in verdict.scores], "passed": verdict.passed}
        if not verdict.passed:
            failed[option.option_id] = verdict.problems() or ["brand judge: below the bar"]
    return failed


async def validate_node(state: State, runtime: Runtime[Any]) -> Command[Literal["review", "investigate", "learn"]]:
    deps = await get_deps(runtime)
    opportunity = _opportunity(state)
    now = deps.clock()
    facts = await load_facts(deps, _thread_id(runtime), runtime.store)
    shop_state = state_from_snapshot(facts.growth)
    proposal = Proposal.model_validate(state["proposal"])
    options, ids = validate_options(proposal, opportunity, deps, facts, shop_state)
    if get_kind(opportunity.kind).growth:
        failed = await brand_review(options, facts)
        revisions = state.get("brand_revisions", 0)
        if failed and revisions < MAX_BRAND_REVISIONS:
            problems = [f"{option_id}: {p}" for option_id, found in failed.items() for p in found]
            update: State = {"options": _dump(options), "problems": problems, "brand_revisions": revisions + 1}
            return Command(goto="investigate", update=update)
        for option in options:
            if option.option_id not in failed:
                continue
            if option.brand.get("lint"):  # copy that breaks the rules is never published
                option.violations += option.brand["lint"]
                option.route, option.tier, option.route_reason = Route.BLOCKED, RiskTier.BLOCKED, "brand rules"
            else:
                option.needs_human = True
                if option.route is Route.AUTO:
                    option.route, option.route_reason = Route.ASK, "the brand judge asked for a person"
    actionable = [o for o in options if o.viable and o.strategy != DO_NOTHING]
    if not actionable:
        problems = [f"{o.option_id} ({o.strategy}): {v}" for o in options for v in o.violations]
        retries = state.get("validation_retries", 0)
        if retries < MAX_VALIDATION_RETRIES:
            retry: State = {"options": _dump(options), "problems": problems, "validation_retries": retries + 1}
            return Command(goto="investigate", update=retry)
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
                "total_vnd": o.total_vnd,
                "needs_human": o.needs_human,
                "brand": o.brand,
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
        if decision.type == "edit" and get_kind(_opportunity(state).kind).growth:
            # Edited copy must still quote the executed numbers and follow the brand rules.
            problems = copy_problems(actions, await deps.reader.growth_snapshot(deps.clock()), BRAND_POLICY)
            if problems:
                return _invalid("edited copy: " + "; ".join(problems))
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
            if get_settings().fault_kill_after_step == len(steps):
                os.kill(
                    os.getpid(), getattr(signal, "SIGKILL", signal.SIGTERM)
                )  # the durability test's crash: this step reached the shop
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
    spec = get_kind(opportunity.kind)
    demo_minutes = get_settings().demo_measure_after_minutes
    # Growth: measured after the flight (the longest duration of the option) plus the measurement window.
    flight = max((int(a.body.get("duration_days", 0)) for a in actions), default=0) if spec.growth else 0
    wait = (
        timedelta(minutes=demo_minutes)
        if demo_minutes is not None
        else timedelta(days=flight + spec.measurement.evaluate_after_days)
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
    spec = get_kind(_opportunity(state).kind)
    if spec.growth:
        measurement = await measure_growth_option(state, deps, _store(runtime), _thread_id(runtime))
    else:
        current = await deps.reader.kpis(spec.measurement.kpis, now)
        result = evaluate(spec.measurement, state.get("baseline", {}), current, now)
        measurement = {
            "verdict": result.verdict.value,
            "summary": result.summary,
            "measured_at": now.isoformat(),
            "deltas": [asdict(d) for d in result.deltas],
        }
    await _store(runtime).adelete(FOLLOWUPS, _thread_id(runtime))
    return Command(goto="learn", update={"measurement": measurement, "outcome": "measured", "stage": "learning"})


async def measure_growth_option(state: State, deps: ShopDeps, store: BaseStore, thread_id: str) -> dict[str, Any]:
    """Incrementality of the executed option; the outcome goes to the web (one row per capability, the costliest
    carrying the figures) and the lever priors move towards what was observed."""
    now = deps.clock()
    snapshot = await deps.reader.growth_snapshot(now)
    actions = [ActionSpec.model_validate(a) for a in state.get("approved", [])]
    first = vn_date(datetime.fromisoformat(state["acted_at"]))
    last = max(snapshot.today - timedelta(days=1), first)
    skus = {s for a in actions for s in a.body.get("skus") or []} | {
        str(a.body["sku"]) for a in actions if a.body.get("sku")
    }
    ad_refs = {str(a.body["ref"]) for a in actions if a.type == "create_ad"}
    ad_refs |= {a.path_params["ref"] for a in actions if a.type in ("set_ad_budget", "set_ad_optimization")}
    rows = [m for m in snapshot.ad_metrics if m.ad_ref in ad_refs and first <= m.day <= last]
    result = measure_growth(
        snapshot,
        skus=sorted(skus),
        first=first,
        last=last,
        defaults=GROWTH_DEFAULTS.measurement,
        spend_vnd=sum(r.spend_vnd for r in rows),
        conversions=sum(r.conversions for r in rows),
        conversion_value_vnd=sum(r.conversion_value_vnd for r in rows),
    )
    campaign = next((str(a.body["ref"]) for a in actions if a.type == "create_campaign"), None)
    capabilities = list(dict.fromkeys(c for a in actions for c in a.capabilities))
    primary = next((c for c in PRIMARY_ORDER if c in capabilities), capabilities[0] if capabilities else None)
    details = {"method": result.method, "days": result.days, "roas": result.roas, "controls": list(result.controls)}
    for capability in capabilities:
        figures = capability == primary
        outcome = marketing.Outcome(
            thread_id=thread_id[:64],
            campaign_ref=campaign,
            capability=capability,
            verdict=result.verdict,
            incremental_revenue_vnd=result.incremental_revenue_vnd if figures else None,
            incremental_profit_vnd=result.incremental_profit_vnd if figures else None,
            spend_vnd=result.spend_vnd if figures else None,
            confidence=result.confidence,
            measured_at=now,
            details=details,
        )
        recorded = await deps.writer.ingest(
            marketing.OUTCOMES_ENDPOINT, outcome.body(), idempotency_key=outcome.idempotency_key()
        )
        if not recorded.ok:
            logger.warning("outcome not recorded", thread_id=thread_id, detail=recorded.detail)
    priors = await current_priors(store)
    learned = learn_priors(priors, observe(snapshot, actions, result, first, last))
    if learned:
        current = priors.with_values(learned)
        await store.aput(GROWTH, PRIORS_KEY, {n: p.model_dump() for n, p in current.values.items()}, index=False)
    return {
        "verdict": result.verdict,
        "summary": result.summary,
        "measured_at": now.isoformat(),
        "method": result.method,
        "incremental_revenue_vnd": result.incremental_revenue_vnd,
        "incremental_profit_vnd": result.incremental_profit_vnd,
        "spend_vnd": result.spend_vnd,
        "roas": result.roas,
        "confidence": result.confidence,
        "priors_updated": sorted(learned),
    }


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
        # What ran: a person's edit replaces the proposed value of the parameter it changed.
        edits = (decision.get("args") or {}) if decision.get("type") == "edit" else {}
        params = {**option["params"], **{k: v for k, v in edits.items() if k in option["params"]}}
        lines.append(f"option: {option['strategy']} {params}")
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
    builder.add_conditional_edges(START, route_entry, ["investigate", "measure", "learn", END])
    builder.add_edge("investigate", "validate")
    builder.add_edge("capture_baseline", "execute")
    builder.add_edge("learn", "close")
    builder.add_edge("close", END)
    return builder


graph = wiring.traced(build().compile(name="improvement"), "improvement")
