"""`shop-agent ingest [--reindex]`: load, split, embed and upsert the knowledge base (docs/ARCHITECTURE.md §9).

Sources: every Markdown file under `data/knowledge/` (SOPs, policies, brand guide) into `kb_documents`, and the
product catalog into `kb_catalog`. Chunk ids are derived from the source and position, so re-ingesting updates rows in
place; chunks that no longer exist are deleted. `--reindex` drops and rebuilds the tables (after changing the
embedding model).
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from shop_agent.adapters.vectorstore import CATALOG, DOCUMENTS, KnowledgeBase
from shop_agent.domain.growth.snapshot import CatalogItem
from shop_agent.domain.ports import ShopReader

KNOWLEDGE_DIR = Path(__file__).resolve().parents[3] / "data" / "knowledge"
CHUNK_SIZE = 800
CHUNK_OVERLAP = 100
CATALOG_DESCRIPTION_CHARS = 500
_ID_NAMESPACE = uuid.UUID("5b0f6d1e-8c1a-4d59-9f55-6f1c2a7b9e10")
_SOURCE_ID = re.compile(r"^([A-Z]+-\d+)")
# Letters only Vietnamese uses among the languages the shop writes in.
_VIETNAMESE = set("ăâđêôơưĂÂĐÊÔƠƯàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ")


def chunk_id(source: str, index: int) -> str:
    return str(uuid.uuid5(_ID_NAMESPACE, f"{source}#{index}"))


def language(text: str) -> str:
    return "vi" if any(ch in _VIETNAMESE for ch in text) else "en"


def source_name(path: Path) -> str:
    """`SOP-001-dead-stock.md` -> `SOP-001`; other files keep their stem (`brand_guide`)."""
    match = _SOURCE_ID.match(path.stem)
    return match.group(1) if match else path.stem


def load_documents(root: Path = KNOWLEDGE_DIR) -> list[Document]:
    splitter = RecursiveCharacterTextSplitter(chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)
    chunks: list[Document] = []
    for path in sorted(root.rglob("*.md")):
        text = path.read_text(encoding="utf-8")
        source = source_name(path)
        category = path.parent.name
        for index, piece in enumerate(splitter.split_text(text)):
            chunks.append(
                Document(
                    id=chunk_id(source, index),
                    page_content=piece,
                    metadata={"source": source, "category": category, "lang": language(text)},
                )
            )
    return chunks


def catalog_text(item: CatalogItem) -> str:
    brand = f", {item.brand}" if item.brand else ""
    description = " ".join(item.description.split())[:CATALOG_DESCRIPTION_CHARS]
    return f"{item.name} ({item.category_name}{brand})" + (f"\n{description}" if description else "")


def catalog_documents(items: Sequence[CatalogItem]) -> list[Document]:
    """One document per product still on sale (archived products are left out, and pruned from the index)."""
    return [
        Document(
            id=chunk_id(f"sku:{item.sku}", 0),
            page_content=catalog_text(item),
            metadata={"source": "catalog", "sku": item.sku, "category": item.category, "lang": language(item.name)},
        )
        for item in sorted(items, key=lambda i: i.sku)
        if not item.is_archived
    ]


@dataclass(frozen=True)
class IngestReport:
    documents: int
    catalog: int
    pruned: int


async def _upsert(kb: KnowledgeBase, table: str, docs: list[Document]) -> int:
    store = await kb.store(table)
    ids = [str(d.id) for d in docs]
    if docs:
        await store.aadd_documents(docs, ids=ids)
    return await kb.prune(table, ids)


async def ingest(
    kb: KnowledgeBase, reader: ShopReader | None, *, reindex: bool = False, root: Path = KNOWLEDGE_DIR
) -> IngestReport:
    await kb.check_model(reset=reindex)
    await kb.ensure_tables(reset=reindex)
    documents = load_documents(root)
    pruned = await _upsert(kb, DOCUMENTS, documents)
    catalog: list[Document] = []
    if reader is not None:
        snapshot = await reader.growth_snapshot(datetime.now(UTC))  # analytics.catalog
        catalog = catalog_documents(snapshot.catalog)
        pruned += await _upsert(kb, CATALOG, catalog)
    return IngestReport(documents=len(documents), catalog=len(catalog), pruned=pruned)
