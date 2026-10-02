"""`check_copy`: the deterministic brand lint (domain/growth/brand.py) as a read-only tool, so the planner can check
its copy before proposing it. validate runs the same lint on the final bodies."""

from __future__ import annotations

from langchain.tools import tool

from shop_agent.adapters.growth_files import BRAND_POLICY
from shop_agent.domain.growth.brand import MAX_LENGTH, TextKind, lint_copy
from shop_agent.tools.deps import ShopToolRuntime, get_deps


@tool
async def check_copy(
    text: str,
    runtime: ShopToolRuntime,
    kind: TextKind = "post",
    percents: list[float] | None = None,
    amounts_vnd: list[int] | None = None,
) -> str:
    """Check one text against the brand rules: banned terms, competitor names, unproven superlatives, length, hashtags,
    emoji, language, and that every % and VND figure equals one of `percents` / `amounts_vnd` (the option's numbers).
    `kind`: post, headline, primary_text, google_headline, google_description, ad_text or coupon_title."""
    if kind not in MAX_LENGTH:
        return f"Unknown kind {kind!r}; use one of: {', '.join(MAX_LENGTH)}."
    deps = await get_deps(runtime)
    snapshot = await deps.reader.growth_snapshot(deps.clock())
    competitors = sorted({p.competitor for p in snapshot.competitor_prices})
    problems = lint_copy(
        text, kind, BRAND_POLICY, percents=percents or [], amounts_vnd=amounts_vnd or [], competitors=competitors
    )
    return (
        "OK: the text passes the brand rules."
        if not problems
        else "Problems:\n" + "\n".join(f"- {p}" for p in problems)
    )
