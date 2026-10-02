"""The shop operations copilot (docs/ARCHITECTURE.md section 6.3): one deep agent, used in chat (the console's
copilot page) and by the daily-briefing cron.

It has the read, estimator and knowledge tools and the write tools; a write that changes the shop pauses for a person
(`agents/approval.py`). Three subagents isolate context and privilege, and none can write to the shop or to a file:

- `analyst`: exploratory SQL over the analytics views, and the competitor and market reads (text written by others);
- `customer_voice`: the only reader of what customers tell the shop, with emails and phone numbers redacted;
- `copywriter`: customer-facing copy, checked by the brand lint.

Playbooks are the runtime skills (`skills/`, read-only). What the owner taught it is `/memories/AGENTS.md` in the
Store, and every change to that file is approved like a write.
"""

from __future__ import annotations

from typing import Any

from deepagents import (
    FilesystemPermission,
    GeneralPurposeSubagentProfile,
    HarnessProfile,
    SubAgent,
    create_deep_agent,
    register_harness_profile,
)
from deepagents.backends import CompositeBackend, FilesystemBackend, StateBackend, StoreBackend
from langchain.agents.middleware import PIIMiddleware
from langchain_core.language_models import BaseChatModel
from langgraph.store.base import BaseStore
from langgraph.types import Checkpointer

from shop_agent import llm, wiring
from shop_agent.agents.approval import ApprovalMiddleware, approval_policy
from shop_agent.agents.investigator import PROMPTS_DIR, language_name
from shop_agent.agents.kinds import SKILLS_DIR
from shop_agent.agents.middleware import role_middleware
from shop_agent.config import get_settings
from shop_agent.tools.brand import check_copy
from shop_agent.tools.deps import configure
from shop_agent.tools.estimators import (
    estimate_bundle,
    estimate_discount,
    estimate_donation,
    estimate_outlet,
    estimate_recycle,
    estimate_repackage,
)
from shop_agent.tools.growth_reads import (
    get_active_promotions,
    get_campaign_performance,
    get_competitor_campaigns,
    get_competitor_prices,
    get_goal_pacing,
    get_market_trends,
    get_policy_limits,
    get_sales_summary,
    get_sku_performance,
    get_upcoming_events,
    list_marketing_assets,
)
from shop_agent.tools.knowledge import search_cases, search_knowledge, search_products
from shop_agent.tools.metrics import find_dead_stock, find_high_return_skus, get_kpis, get_stock
from shop_agent.tools.sql import SQL_TOOLS
from shop_agent.tools.writes import WRITE_TOOLS

configure(wiring.default_deps)

PROMPTS = {
    name: (PROMPTS_DIR / f"{name}.md").read_text(encoding="utf-8")
    for name in ("assistant", "analyst", "customer_voice", "copywriter")
}
SKILLS = ["/skills/"]
MEMORY_FILE = "/memories/AGENTS.md"
MEMORY_NAMESPACE = ("memories",)
# A Vietnamese phone number (0 or +84, a mobile prefix, 8 more digits; spaces, dots or dashes between digits).
VN_PHONE = r"(?<!\d)(?:\+84|84|0)[35789](?:[\s.-]?\d){8}(?!\d)"
# Subagents read files (skills, memory) and write none: only the main agent learns, and only with approval.
READ_ONLY_FILES = [FilesystemPermission(operations=["write"], paths=["/**"], mode="deny")]

ESTIMATOR_TOOLS = [
    estimate_discount,
    estimate_outlet,
    estimate_bundle,
    estimate_donation,
    estimate_recycle,
    estimate_repackage,
]
# Every read tool except those returning text written by others (competitors: the analyst; customers: customer_voice).
READ_TOOLS = [
    find_dead_stock,
    get_stock,
    get_kpis,
    get_sales_summary,
    get_sku_performance,
    get_goal_pacing,
    get_active_promotions,
    get_campaign_performance,
    get_market_trends,
    get_upcoming_events,
    get_policy_limits,
    list_marketing_assets,
    check_copy,
]
KNOWLEDGE_TOOLS = [search_knowledge, search_products, search_cases]


def prompt(name: str) -> str:
    return PROMPTS[name].replace("{language}", language_name(get_settings().agent_language))


def redact(pii_type: str, detector: str | None = None) -> PIIMiddleware:
    """Redact this kind of personal data in what the agent reads (input, tool results) and writes."""
    return PIIMiddleware(
        pii_type, strategy="redact", detector=detector, apply_to_tool_results=True, apply_to_output=True
    )


def subagents() -> list[SubAgent]:
    worker = llm.chat_model(llm.ModelRole.WORKER)
    return [
        SubAgent(
            name="analyst",
            description=(
                "Answers data questions with SQL over the shop's analytics views, and reads competitor prices, "
                "competitor campaigns and market trends. Use it for anything that needs many rows."
            ),
            system_prompt=prompt("analyst"),
            tools=[*SQL_TOOLS, get_competitor_prices, get_competitor_campaigns, get_market_trends, get_sales_summary],
            model=worker,
            middleware=role_middleware(llm.ModelRole.WORKER, model_call_limit=15),
            permissions=READ_ONLY_FILES,
        ),
        SubAgent(
            name="customer_voice",
            description="Reads what customers tell the shop (returns and their reasons) and reports the patterns.",
            system_prompt=prompt("customer_voice"),
            tools=[find_high_return_skus, search_knowledge],
            model=worker,
            middleware=[
                redact("email"),
                redact("vn_phone", VN_PHONE),
                *role_middleware(llm.ModelRole.WORKER),
            ],
            permissions=READ_ONLY_FILES,
        ),
        SubAgent(
            name="copywriter",
            description=(
                "Writes customer-facing Vietnamese copy (posts, coupon titles, ad text) in the brand voice. Give it "
                "the product, the offer and every number the copy may quote."
            ),
            system_prompt=prompt("copywriter"),
            tools=[check_copy, search_knowledge, search_products],
            model=llm.chat_model(llm.ModelRole.WRITER),
            middleware=role_middleware(llm.ModelRole.WRITER),
            permissions=READ_ONLY_FILES,
            skills=SKILLS,
        ),
    ]


def _without_general_purpose_subagent(model: BaseChatModel) -> None:
    """deepagents adds a `general-purpose` subagent with every tool of the main agent, the write tools included,
    unless the model's harness profile disables it. The copilot's subagents are its own (section 6.3)."""
    provider = model._get_ls_params().get("ls_provider")  # the key deepagents looks the profile up by
    if provider:
        profile = HarnessProfile(general_purpose_subagent=GeneralPurposeSubagentProfile(enabled=False))
        register_harness_profile(provider, profile)


def build(checkpointer: Checkpointer = None, store: BaseStore | None = None) -> Any:
    model = llm.chat_model(llm.ModelRole.PLANNER)
    _without_general_purpose_subagent(model)
    return create_deep_agent(
        model=model,
        tools=[*READ_TOOLS, *ESTIMATOR_TOOLS, *KNOWLEDGE_TOOLS, *WRITE_TOOLS],
        system_prompt=prompt("assistant"),
        middleware=[ApprovalMiddleware(), *role_middleware(llm.ModelRole.PLANNER, model_call_limit=20)],
        subagents=subagents(),
        skills=SKILLS,
        memory=[MEMORY_FILE],
        interrupt_on=approval_policy(),
        backend=CompositeBackend(
            default=StateBackend(),
            routes={
                "/skills/": FilesystemBackend(root_dir=SKILLS_DIR, virtual_mode=True),
                "/memories/": StoreBackend(namespace=lambda _runtime: MEMORY_NAMESPACE),
            },
        ),
        permissions=[
            FilesystemPermission(operations=["write"], paths=["/skills/**"], mode="deny"),
            FilesystemPermission(operations=["write"], paths=["/memories/**"], mode="interrupt"),
        ],
        checkpointer=checkpointer,
        store=store,
        name="assistant",
    )


graph = build()
