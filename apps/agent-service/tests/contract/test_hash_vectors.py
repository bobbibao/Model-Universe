"""The request hash that approval grants bind must equal the web's `hashAgentRequest` byte for byte.

packages/contracts/test-vectors/hash/request-hash.json is generated from the web's TypeScript and asserted here and by
the web's Jest suite.
"""

import json
from pathlib import Path

import pytest

from shop_agent.domain.approval import canonical_json, request_hash

VECTORS = Path(__file__).resolve().parents[4] / "packages/contracts/test-vectors/hash/request-hash.json"


@pytest.mark.parametrize("vector", json.loads(VECTORS.read_text())["vectors"], ids=lambda v: v["name"])
def test_request_hash_matches_the_web(vector: dict[str, object]) -> None:
    body = vector["body"]
    assert isinstance(body, dict)
    assert canonical_json(body) == vector["canonical"]
    assert request_hash(str(vector["endpoint"]), body) == vector["hash"]
