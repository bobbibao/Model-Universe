"""The agent's knowledge base: pgvector tables in the agent's own database, through LangChain's PGVectorStore.

Tables: `kb_documents` (SOPs, policies, brand material) and `kb_catalog` (product names, descriptions, categories).
`kb_meta` records which embedding model built them; opening the knowledge base with another model is refused,
because vectors from different models cannot be compared (re-index with `shop-agent ingest --reindex`).
"""

from __future__ import annotations

import asyncio
import sys
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

import psycopg
from langchain_core.embeddings import Embeddings
from langchain_postgres import Column, PGEngine, PGVectorStore
from psycopg import sql

DOCUMENTS = "kb_documents"
CATALOG = "kb_catalog"
TABLES = (DOCUMENTS, CATALOG)
METADATA_COLUMNS = ("source", "sku", "category", "lang")

META_DDL = (
    "CREATE TABLE IF NOT EXISTS kb_meta "
    "(id int PRIMARY KEY DEFAULT 1, embedding_model text NOT NULL, dims int NOT NULL)"
)


class EmbeddingMismatch(RuntimeError):
    pass


def sqlalchemy_url(dsn: str) -> str:
    """`postgresql://...` (libpq, as configured) -> `postgresql+psycopg://...` (what PGEngine expects)."""
    for prefix in ("postgresql://", "postgres://"):
        if dsn.startswith(prefix):
            return "postgresql+psycopg://" + dsn[len(prefix) :]
    return dsn


@dataclass
class KnowledgeBase:
    dsn: str
    embeddings: Embeddings
    embedding_model: str
    dims: int

    def __post_init__(self) -> None:
        # PGEngine starts its own event loop; built in a worker thread so that constructing it inside a running loop
        # (the Agent Server) does not trip the blocking-call check (Windows loops open a socket pair).
        if sys.platform == "win32":  # psycopg's async mode cannot run on the default Proactor loop
            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        with ThreadPoolExecutor(max_workers=1) as pool:
            self._engine = pool.submit(PGEngine.from_connection_string, sqlalchemy_url(self.dsn)).result()

    async def check_model(self, *, reset: bool = False) -> None:
        """Record the embedding model on first use; refuse a different one unless re-indexing."""
        async with await psycopg.AsyncConnection.connect(self.dsn) as conn:
            await conn.execute(META_DDL)
            row = await (await conn.execute("SELECT embedding_model, dims FROM kb_meta WHERE id = 1")).fetchone()
            if row is None or reset:
                await conn.execute(
                    "INSERT INTO kb_meta (id, embedding_model, dims) VALUES (1, %s, %s) "
                    "ON CONFLICT (id) DO UPDATE SET embedding_model = EXCLUDED.embedding_model, dims = EXCLUDED.dims",
                    (self.embedding_model, self.dims),
                )
                return
            if (row[0], row[1]) != (self.embedding_model, self.dims):
                raise EmbeddingMismatch(
                    f"the knowledge base was built with {row[0]} ({row[1]} dims), not {self.embedding_model} "
                    f"({self.dims} dims): run `shop-agent ingest --reindex`"
                )

    async def missing_tables(self) -> list[str]:
        async with await psycopg.AsyncConnection.connect(self.dsn) as conn:
            missing = []
            for table in TABLES:
                row = await (await conn.execute("SELECT to_regclass(%s)", (table,))).fetchone()
                if row is None or row[0] is None:
                    missing.append(table)
            return missing

    async def ensure_tables(self, *, reset: bool = False) -> None:
        # ainit_vectorstore_table is a plain CREATE TABLE: only create the tables that do not exist yet.
        missing = set(await self.missing_tables())
        for table in TABLES:
            if table not in missing and not reset:
                continue
            await self._engine.ainit_vectorstore_table(
                table,
                self.dims,
                metadata_columns=[Column(name, "TEXT") for name in METADATA_COLUMNS],
                id_column="langchain_id",
                overwrite_existing=reset,
            )

    async def store(self, table: str) -> PGVectorStore:
        return await PGVectorStore.create(self._engine, self.embeddings, table, metadata_columns=list(METADATA_COLUMNS))

    async def prune(self, table: str, keep_ids: list[str]) -> int:
        """Delete the rows of `table` whose id is not in `keep_ids` (chunks of removed or shortened documents)."""
        if table not in TABLES:
            raise ValueError(f"unknown knowledge table {table!r}")
        async with await psycopg.AsyncConnection.connect(self.dsn) as conn:
            cur = await conn.execute(
                sql.SQL("DELETE FROM {} WHERE langchain_id::text <> ALL(%s)").format(sql.Identifier(table)),
                (keep_ids,),
            )
            return cur.rowcount

    async def count(self, table: str) -> int:
        async with await psycopg.AsyncConnection.connect(self.dsn) as conn:
            row = await (
                await conn.execute(sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(table)))
            ).fetchone()
            return int(row[0]) if row else 0

    async def close(self) -> None:
        await self._engine.close()
