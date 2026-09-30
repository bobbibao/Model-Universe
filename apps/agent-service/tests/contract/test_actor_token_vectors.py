"""Actor tokens signed by the web gateway verify here exactly as the contract says (packages/contracts/test-vectors)."""

import json
from pathlib import Path
from typing import Any

import pytest

from shop_agent.adapters.actor_tokens import LEEWAY_SECONDS, MAX_TTL_SECONDS, InvalidActorToken, verify_actor_token

CONTRACT = json.loads(
    (Path(__file__).resolve().parents[4] / "packages/contracts/test-vectors/actor-token.json").read_text()
)


def test_limits_match_the_contract() -> None:
    assert (CONTRACT["max_ttl_seconds"], CONTRACT["leeway_seconds"]) == (MAX_TTL_SECONDS, LEEWAY_SECONDS)


@pytest.mark.parametrize("vector", CONTRACT["vectors"], ids=lambda v: v["name"])
def test_vector(vector: dict[str, Any]) -> None:
    def verify() -> Any:
        return verify_actor_token(
            vector["token"],
            secret=CONTRACT["secret"],
            issuer=CONTRACT["issuer"],
            audience=CONTRACT["audience"],
            now=vector["now"],
        )

    if vector["valid"]:
        assert verify().model_dump() == vector["claims"]
    else:
        with pytest.raises(InvalidActorToken):
            verify()
