from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

import pytest

from shop_agent import wiring
from shop_agent.adapters.fake_shop import FakeShop
from shop_agent.adapters.vectorstore import CATALOG, DOCUMENTS, EmbeddingMismatch, KnowledgeBase
from shop_agent.config import Settings
from shop_agent.knowledge.ingest import KNOWLEDGE_DIR, ingest
from shop_agent.tools.deps import ShopDeps
from shop_agent.tools.knowledge import search_knowledge, search_products
from tests.integration.conftest import require_env
from tests.support.factories import NOW
from tests.support.tools import call_tool

pytestmark = pytest.mark.db


@pytest.fixture
def settings() -> Settings:
    return Settings(database_url=require_env("AGENT_TEST_DATABASE_URL"), llm_profile="scripted", shop_adapter="fake")


@pytest.fixture
async def kb(settings: Settings) -> AsyncIterator[KnowledgeBase]:
    kb = wiring.knowledge_base(settings)
    assert kb is not None
    await ingest(kb, None, reindex=True)
    yield kb
    await kb.close()


async def test_a_vietnamese_question_finds_the_sop(kb: KnowledgeBase) -> None:
    store = await kb.store(DOCUMENTS)
    top = await store.asimilarity_search("hàng tồn kho lâu ngày", k=3)
    assert "SOP-001" in [d.metadata["source"] for d in top]


async def test_reingesting_keeps_the_row_count(kb: KnowledgeBase) -> None:
    before = await kb.count(DOCUMENTS)
    report = await ingest(kb, None)
    assert report.pruned == 0 and await kb.count(DOCUMENTS) == before == report.documents


async def test_removed_documents_are_pruned(kb: KnowledgeBase, tmp_path: Path) -> None:
    (tmp_path / "sop").mkdir()
    only = KNOWLEDGE_DIR / "sop" / "SOP-001-dead-stock.md"
    (tmp_path / "sop" / only.name).write_text(only.read_text("utf-8"), "utf-8")
    report = await ingest(kb, None, root=tmp_path)
    assert report.pruned > 0 and await kb.count(DOCUMENTS) == report.documents
    store = await kb.store(DOCUMENTS)
    assert {d.metadata["source"] for d in await store.asimilarity_search("đổi trả", k=10)} == {"SOP-001"}


async def test_metadata_filters(kb: KnowledgeBase, settings: Settings) -> None:
    deps = ShopDeps(reader=FakeShop({}, [], {}), writer=FakeShop({}, [], {}), documents=await kb.store(DOCUMENTS))
    text = await call_tool(search_knowledge, {"query": "hàng tồn kho", "source": "SOP-002"}, deps)
    assert text.startswith("[SOP-002]") and "[SOP-001]" not in text


async def test_a_different_embedding_model_is_refused(kb: KnowledgeBase, settings: Settings) -> None:
    other = KnowledgeBase(kb.dsn, kb.embeddings, "ollama:another-model", kb.dims)
    try:
        with pytest.raises(EmbeddingMismatch, match="ingest --reindex"):
            await other.check_model()
    finally:
        await other.close()


async def test_catalog_and_wiring(settings: Settings) -> None:
    kb = wiring.knowledge_base(settings)
    assert kb is not None
    shop = FakeShop.seed_demo(lambda: NOW, n_stock=40)
    try:
        report = await ingest(kb, shop, reindex=True)
        assert report.catalog == 40 and await kb.count(CATALOG) == 40
    finally:
        await kb.close()
    deps = await wiring.build_deps(settings)
    assert deps.documents is not None and deps.catalog is not None
    first = shop.stock["SKU-0000"]
    text = await call_tool(search_products, {"query": first.name, "k": 1}, deps)
    assert text.startswith("- SKU-0000:")
