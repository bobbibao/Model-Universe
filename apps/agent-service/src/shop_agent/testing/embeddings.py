"""A deterministic, lexically meaningful embedding for tests and the scripted profile (no model, no network).

Words and character trigrams are hashed into a fixed number of dimensions and L2-normalised, so texts that share words
are close. That makes retrieval tests real tests instead of luck with random vectors.
"""

from __future__ import annotations

import hashlib
import math
import re
import unicodedata

from langchain_core.embeddings import Embeddings

_WORD = re.compile(r"\w+", re.UNICODE)


def _features(text: str) -> list[str]:
    normalized = unicodedata.normalize("NFC", text.lower())
    words = _WORD.findall(normalized)
    features = [f"w:{w}" for w in words]
    for word in words:
        padded = f"#{word}#"
        features.extend(f"t:{padded[i : i + 3]}" for i in range(max(len(padded) - 2, 1)))
    return features


class HashingEmbedding(Embeddings):
    def __init__(self, size: int = 1024) -> None:
        self.size = size

    def _embed(self, text: str) -> list[float]:
        vector = [0.0] * self.size
        for feature in _features(text):
            digest = hashlib.blake2b(feature.encode(), digest_size=8).digest()
            index = int.from_bytes(digest[:4], "big") % self.size
            sign = 1.0 if digest[4] & 1 else -1.0
            vector[index] += sign * (2.0 if feature.startswith("w:") else 1.0)
        norm = math.sqrt(sum(v * v for v in vector)) or 1.0
        return [v / norm for v in vector]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._embed(text) for text in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._embed(text)
