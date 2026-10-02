"""Loop suite: the `improvement` investigation on a FakeShop scenario, validated by code, as the review shows it.

Runs exactly what the graph's investigate and validate steps run (`investigation_message`, `investigate`,
`validate_options`), with the kind's read-only tools against FakeShop.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from typing import Any

from evals.evaluators import CaseOutput
from shop_agent.adapters.fake_shop import FakeShop
from shop_agent.agents.investigator import investigate
from shop_agent.agents.kinds import get_kind
from shop_agent.domain.detectors import default_detectors
from shop_agent.domain.growth.policies import state_from_snapshot
from shop_agent.domain.policies.limits import Limits
from shop_agent.graphs.improvement import investigation_message, validate_options
from shop_agent.tools.deps import ShopDeps

NOW = datetime(2026, 9, 29, 9, tzinfo=UTC)


def build_shop(case: dict[str, Any]) -> FakeShop:
    shop = FakeShop.seed_demo(lambda: NOW, seed=int(case.get("seed", 7)))
    renamed = case.get("rename_dead_stock")
    if renamed:  # untrusted text in the data: a product name that tries to instruct the agent
        dead = next(o for d in default_detectors() for o in d.detect(shop.snapshot_now(NOW), NOW))
        sku = dead.skus[0]
        shop.stock[sku] = replace(shop.stock[sku], name=str(renamed))
    return shop


async def run_case(case: dict[str, Any], profile: str) -> CaseOutput:
    shop = build_shop(case)
    limits = Limits(**case.get("limits", {}))
    deps = ShopDeps(reader=shop, writer=shop, limits=limits, clock=lambda: NOW, model_profile=profile)
    snapshot = shop.snapshot_now(NOW)
    opportunity = next(o for d in default_detectors() for o in d.detect(snapshot, NOW) if o.kind == case["kind"])
    message = await investigation_message(opportunity, deps, responses=case.get("owner_notes", []))
    proposal, messages = await investigate(
        get_kind(opportunity.kind), message, context=deps, script_key=f"improvement.investigate.{opportunity.kind}"
    )
    shop_state = state_from_snapshot(await shop.growth_snapshot(NOW))
    options, ids = validate_options(proposal, opportunity, deps, snapshot, NOW, "eval", shop_state)
    viable = [o for o in options if o.viable]
    recommended = next((o for o in viable if o.option_id == ids.get(proposal.recommended_option_id)), None)
    structured = {
        "sop_refs": proposal.sop_refs,
        "options": [{"option_id": o.option_id, "strategy": o.strategy, "params": o.params} for o in viable],
        "recommended_strategy": recommended.strategy if recommended else None,
        "proposal": proposal.model_dump(),
    }
    text = [proposal.summary, *(c.text for c in proposal.causes), *(o.rationale for o in proposal.options)]
    return CaseOutput(messages=messages, structured=structured, final_text="\n".join(text))
