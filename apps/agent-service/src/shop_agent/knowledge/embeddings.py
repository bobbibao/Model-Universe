"""Embedding entry point for the Agent Server's Store index (`langgraph.json` -> `store.index.embed`).

The same model embeds the knowledge base and the Store (cases), so both are searched with one kind of vector.
"""

from __future__ import annotations

from shop_agent import llm


async def aembed(texts: list[str]) -> list[list[float]]:
    return await llm.embeddings().aembed_documents(texts)
