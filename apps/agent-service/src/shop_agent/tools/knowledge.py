"""Agentic RAG: the agent decides when to look things up (SOPs, policies, brand, products, past cases).

Metadata filters use the pgvector store's filter syntax (`{"column": {"$eq": value}}`).
"""

from __future__ import annotations

from typing import Any

from langchain.tools import tool

from shop_agent.tools.deps import ShopToolRuntime, get_deps

CASES_NAMESPACE = ("cases",)


def _eq(column: str, value: str | None) -> dict[str, Any]:
    return {"filter": {column: {"$eq": value}}} if value else {}


@tool
async def search_knowledge(query: str, runtime: ShopToolRuntime, source: str | None = None, k: int = 4) -> str:
    """Search the shop's SOPs, policies and brand guide. Cite the source (e.g. SOP-001) in your answer.

    `source` limits the search to one document, e.g. "SOP-002" or "brand_guide".
    """
    store = (await get_deps(runtime)).documents
    if store is None:
        return "The knowledge base is not available."
    documents = await store.asimilarity_search(query, k=min(k, 8), **_eq("source", source))
    if not documents:
        return "Nothing found."
    return "\n\n".join(f"[{d.metadata.get('source', '?')}]\n{d.page_content}" for d in documents)


@tool
async def search_products(query: str, runtime: ShopToolRuntime, category: str | None = None, k: int = 5) -> str:
    """Search the product catalog by meaning (names, descriptions, categories), optionally within one category."""
    store = (await get_deps(runtime)).catalog
    if store is None:
        return "The product catalog index is not available."
    documents = await store.asimilarity_search(query, k=min(k, 10), **_eq("category", category))
    return "\n".join(f"- {d.metadata.get('sku', '?')}: {d.page_content}" for d in documents) or "Nothing found."


@tool
async def search_cases(query: str, runtime: ShopToolRuntime, kind: str | None = None, k: int = 3) -> str:
    """Search past cases (what was decided before and how it turned out) for similar situations."""
    if runtime.store is None:
        return "No case memory in this run."
    namespace = (*CASES_NAMESPACE, kind) if kind else CASES_NAMESPACE
    items = await runtime.store.asearch(namespace, query=query, limit=min(k, 5))
    if not items:
        return "No similar case yet."
    return "\n\n".join(f"[case {item.key}]\n{item.value.get('text', '')}" for item in items)


KNOWLEDGE_TOOLS = [search_knowledge, search_products, search_cases]
