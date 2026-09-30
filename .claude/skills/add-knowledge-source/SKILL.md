---
name: add-knowledge-source
description: Add a new source of documents to the agent's knowledge base (SOPs, policies, brand material, catalog data) so search_knowledge / search_products can retrieve it. Use when the agent should cite or use new reference material.
---

Status: stub; finished in Phase 2 when ingestion exists.

1. Put markdown under `apps/agent-service/data/knowledge/<area>/` (or add a loader in `knowledge/ingest.py`).
2. Metadata: `source`, `lang`, and `sku`/`category` where they apply.
3. Run `uv run shop-agent ingest` (add `--reindex` after changing the embedding model).
4. Test retrieval in `tests/integration/test_knowledge.py` (`-m db`) with the hashing embedding.
