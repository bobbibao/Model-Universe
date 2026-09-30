from __future__ import annotations

import math

from shop_agent.testing.embeddings import HashingEmbedding


def cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b, strict=True))


def test_dimensions_and_unit_norm() -> None:
    vector = HashingEmbedding(1024).embed_query("xin chào")
    assert len(vector) == 1024
    assert math.isclose(sum(v * v for v in vector), 1.0, rel_tol=1e-9)


def test_deterministic() -> None:
    assert HashingEmbedding().embed_query("tồn kho") == HashingEmbedding().embed_query("tồn kho")


def test_lexical_overlap_ranks_first() -> None:
    embedding = HashingEmbedding()
    docs = [
        "Quy trình xử lý hàng tồn kho lâu ngày: giảm giá, bán kèm, chuyển kênh outlet.",
        "Chính sách đổi trả trong 30 ngày cho sản phẩm còn nguyên tem.",
        "Hướng dẫn chụp ảnh sản phẩm cho trang bán hàng.",
    ]
    query = embedding.embed_query("hàng tồn kho lâu ngày")
    scores = [cosine(query, d) for d in embedding.embed_documents(docs)]
    assert scores.index(max(scores)) == 0
