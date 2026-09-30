"""The knowledge sources in data/knowledge load and split, and keep the invariants the agent relies on."""

from shop_agent.knowledge.ingest import CHUNK_SIZE, KNOWLEDGE_DIR, chunk_id, language, load_documents, source_name


def test_every_document_loads_with_its_metadata() -> None:
    chunks = load_documents()
    sources = {c.metadata["source"] for c in chunks}
    assert {"SOP-001", "SOP-002", "brand_guide"} <= sources
    assert all(len(c.page_content) <= CHUNK_SIZE for c in chunks)
    assert len({c.id for c in chunks}) == len(chunks)  # stable, unique ids: re-ingesting updates in place


def test_staff_facing_documents_are_vietnamese() -> None:
    assert {c.metadata["lang"] for c in load_documents()} == {"vi"}


def test_brand_guide_is_a_draft_until_the_owner_approves_it() -> None:
    text = (KNOWLEDGE_DIR / "brand" / "brand_guide.md").read_text("utf-8")
    assert "Status: DRAFT - owner review required" in text


def test_helpers() -> None:
    assert source_name(KNOWLEDGE_DIR / "sop" / "SOP-001-dead-stock.md") == "SOP-001"
    assert source_name(KNOWLEDGE_DIR / "brand" / "brand_guide.md") == "brand_guide"
    assert language("Hàng tồn kho") == "vi" and language("Dead stock") == "en"
    assert chunk_id("SOP-001", 0) == chunk_id("SOP-001", 0) != chunk_id("SOP-001", 1)
