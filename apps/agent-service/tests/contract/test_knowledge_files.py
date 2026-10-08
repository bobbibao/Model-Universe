"""The knowledge sources in data/knowledge load and split, and keep the invariants the agent relies on."""

from shop_agent.knowledge.ingest import CHUNK_SIZE, KNOWLEDGE_DIR, chunk_id, language, load_documents, source_name


def test_every_document_loads_with_its_metadata() -> None:
    chunks = load_documents()
    sources = {c.metadata["source"] for c in chunks}
    assert {"SOP-001", "SOP-002", "brand_guide"} <= sources
    assert all(len(c.page_content) <= CHUNK_SIZE for c in chunks)
    assert len({c.id for c in chunks}) == len(chunks)  # stable, unique ids: re-ingesting updates in place


def test_knowledge_preserves_supported_source_languages() -> None:
    chunks = load_documents()
    assert {c.metadata["lang"] for c in chunks} <= {"vi", "en"}
    assert {c.metadata["lang"] for c in chunks if c.metadata["source"] == "brand_guide"} == {"en"}
    assert {c.metadata["lang"] for c in chunks if c.metadata["source"] in {"SOP-001", "SOP-002"}} == {"vi"}


def test_brand_guide_is_a_draft_until_the_owner_approves_it() -> None:
    text = (KNOWLEDGE_DIR / "brand" / "brand_guide.md").read_text("utf-8")
    assert "Status: DRAFT - owner review required" in text


def test_helpers() -> None:
    assert source_name(KNOWLEDGE_DIR / "sop" / "SOP-001-dead-stock.md") == "SOP-001"
    assert source_name(KNOWLEDGE_DIR / "brand" / "brand_guide.md") == "brand_guide"
    assert language("Hàng tồn kho") == "vi" and language("Dead stock") == "en"
    assert chunk_id("SOP-001", 0) == chunk_id("SOP-001", 0) != chunk_id("SOP-001", 1)


def test_catalog_documents_come_from_the_catalog_view() -> None:
    from dataclasses import replace
    from datetime import UTC, datetime

    from shop_agent.domain.growth.snapshot import CatalogItem
    from shop_agent.knowledge.ingest import catalog_documents

    shoe = CatalogItem(
        "SKU-2", "Giày cao gót", "Mira", "heels", "Giày cao gót", 500_000, 500_000, 0, 300_000, 4, "available", "web",
        False, datetime(2026, 1, 1, tzinfo=UTC), "Da  bò thật,\nđế 7 cm",
    )  # fmt: skip
    archived = replace(shoe, sku="SKU-1", is_archived=True)
    [doc] = catalog_documents([shoe, archived])
    assert doc.page_content == "Giày cao gót (Giày cao gót, Mira)\nDa bò thật, đế 7 cm"
    assert doc.metadata == {"source": "catalog", "sku": "SKU-2", "category": "heels", "lang": "vi"}
