from __future__ import annotations

import pytest

from shop_agent.adapters.fake_shop import FakeShop
from shop_agent.tools.deps import ShopDeps
from tests.support.factories import NOW, item, returned


@pytest.fixture
def shop() -> FakeShop:
    stock = {
        "OLD1": item("OLD1", days=200, quantity=30),
        "OLD2": item("OLD2", days=120, quantity=10, condition="open_box"),
        "BEST": item("BEST", days=10, quantity=60),
        "RET": item("RET", days=20, quantity=25),
    }
    returns = [returned("RET", n=n, reason="size" if n % 2 else "not as described") for n in range(5)]
    return FakeShop(stock, returns, {"OLD1": 0.02, "OLD2": 0.03, "BEST": 3.0, "RET": 0.2}, clock=lambda: NOW)


@pytest.fixture
def deps(shop: FakeShop) -> ShopDeps:
    return ShopDeps(reader=shop, writer=shop, clock=lambda: NOW, model_profile="scripted")
