from langchain_core.documents import Document
from langchain_core.vectorstores import InMemoryVectorStore
from langgraph.store.memory import InMemoryStore

from shop_agent.testing.embeddings import HashingEmbedding
from shop_agent.tools.deps import ShopDeps
from shop_agent.tools.knowledge import search_cases, search_knowledge, search_products
from tests.support.tools import call_tool

SOPS = [
    Document(
        "SOP-001: Xử lý hàng tồn kho lâu ngày. Giảm giá có thời hạn, combo, outlet.", metadata={"source": "SOP-001"}
    ),
    Document("SOP-002: Xử lý sản phẩm có tỷ lệ đổi trả cao. Đọc lý do đổi trả.", metadata={"source": "SOP-002"}),
    Document("Hướng dẫn thương hiệu: giọng văn thân thiện, không nêu tên đối thủ.", metadata={"source": "brand_guide"}),
]


async def test_search_knowledge_cites_the_source(deps: ShopDeps) -> None:
    store = InMemoryVectorStore(HashingEmbedding())
    await store.aadd_documents(SOPS)
    deps.documents = store
    text = await call_tool(search_knowledge, {"query": "hàng tồn kho lâu ngày", "k": 1}, deps)
    assert text.startswith("[SOP-001]")


async def test_search_products(deps: ShopDeps) -> None:
    store = InMemoryVectorStore(HashingEmbedding())
    await store.aadd_documents(
        [
            Document("Giày sneaker Nike Air (sneakers)", metadata={"sku": "N1"}),
            Document("Áo len cổ tròn (sweaters)", metadata={"sku": "S1"}),
        ]
    )
    deps.catalog = store
    assert (await call_tool(search_products, {"query": "giày sneaker", "k": 1}, deps)).startswith("- N1:")


async def test_unavailable_knowledge_is_explained(deps: ShopDeps) -> None:
    assert await call_tool(search_knowledge, {"query": "x"}, deps) == "The knowledge base is not available."
    assert await call_tool(search_products, {"query": "x"}, deps) == "The product catalog index is not available."
    assert await call_tool(search_cases, {"query": "x"}, deps) == "No case memory in this run."


async def test_search_cases_uses_the_store_index(deps: ShopDeps) -> None:
    embedding = HashingEmbedding()
    store = InMemoryStore(index={"embed": embedding, "dims": embedding.size, "fields": ["text"]})
    await store.aput(("cases", "dead_stock"), "c1", {"text": "Giảm giá 20% hàng tồn lâu: giá trị tồn giảm 35%"})
    await store.aput(("cases", "high_returns"), "c2", {"text": "Sửa bảng size: tỷ lệ đổi trả giảm"})
    text = await call_tool(search_cases, {"query": "giảm giá hàng tồn", "kind": "dead_stock"}, deps, store=store)
    assert text.startswith("[case c1]") and "c2" not in text
