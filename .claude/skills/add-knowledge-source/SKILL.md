---
name: add-knowledge-source
description: Add a new source of documents to the agent's knowledge base (SOPs, policies, brand material, catalog data) so search_knowledge / search_products can retrieve it. Use when the agent should cite or use new reference material.
---

Paths are relative to `apps/agent-service/`.

1. Documents: put Markdown under `data/knowledge/<area>/`. Everything staff read is Vietnamese. The file name gives
   the `source` a citation uses (`SOP-003-...md` -> `SOP-003`, other files keep their stem); `<area>` becomes
   `category`; `lang` is detected. Chunks are 800 characters with 100 overlap and have stable ids, so re-ingesting
   updates in place and deletes chunks that no longer exist.
2. Another kind of source (not Markdown): add a loader next to `load_documents` / `catalog_documents` in
   `src/shop_agent/knowledge/ingest.py` that returns `Document`s with `id=chunk_id(source, n)` and metadata limited to
   the columns in `adapters/vectorstore.py:METADATA_COLUMNS` (`source`, `sku`, `category`, `lang`). A new metadata
   column needs `shop-agent ingest --reindex`. Never index customer identity.
3. Run `uv run shop-agent ingest` (needs `DATABASE_URL`; `--reindex` after changing the embedding model, which is
   otherwise refused).
4. Tests: `tests/contract/test_knowledge_files.py` for the files; retrieval in `tests/integration/test_knowledge.py`
   (`-m db`, hashing embedding) with a Vietnamese query that must return the new source in the top 3.
