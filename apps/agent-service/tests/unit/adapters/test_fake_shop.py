from typing import Any

from shop_agent.adapters.fake_shop import FakeShop
from shop_agent.domain.actions import ActionSpec
from shop_agent.domain.capabilities import Capability
from shop_agent.domain.kpi import DEAD_STOCK_VALUE
from shop_agent.domain.policies.autonomy import AutonomyMode, AutonomySettings
from shop_agent.testing.grants import approval_test_secret, approve
from tests.support.factories import NOW, discount, item


def _shop(**kwargs: Any) -> FakeShop:
    stock = {s: item(s, days=150) for s in ("A1", "A2")}
    return FakeShop(stock, [], {"A1": 0.05, "A2": 0.05}, clock=lambda: NOW, **kwargs)


def _grant_for(spec: ActionSpec, *, thread: str = "t1", ttl: int = 3600) -> str:
    return approve(
        thread_id=thread,
        actions=[(spec.action_id, spec.endpoint, spec.idempotency_key, spec.body)],
        now=int(NOW.timestamp()),
        ttl_seconds=ttl,
    )


async def test_applies_once_and_replays_by_key() -> None:
    shop = _shop()
    spec = discount(("A1",), 20)
    first, again = await shop.execute(spec), await shop.execute(spec)
    assert first.ok and again == first
    assert len(shop.applied("pricing/discounts")) == 1 and shop.discounts == {"A1": 20.0}


async def test_same_key_other_body_is_a_conflict() -> None:
    shop = _shop()
    await shop.execute(discount(("A1",), 20))
    result = await shop.execute(discount(("A1",), 30))
    assert (result.ok, result.status_code, result.error_code) == (False, 409, "conflict")
    assert shop.discounts == {"A1": 20.0}


async def test_enforced_grants() -> None:
    shop = _shop(grant_secret=approval_test_secret())
    spec = discount(("A1",), 20)
    refused = await shop.execute(spec)
    assert (refused.status_code, refused.error_code) == (403, "approval_required")
    assert (await shop.execute(spec, grant=_grant_for(spec))).ok


async def test_a_grant_binds_key_and_body() -> None:
    shop = _shop(grant_secret=approval_test_secret())
    spec = discount(("A1",), 20)
    grant = _grant_for(spec)
    assert not (await shop.execute(discount(("A1",), 25), grant=grant)).ok  # edited body
    assert not (await shop.execute(discount(("A1",), 20, key="other"), grant=grant)).ok  # replay under a new key
    assert not (await shop.execute(spec, grant=grant + "x")).ok  # tampered


async def test_grant_expiry_uses_the_shop_clock() -> None:
    shop = _shop(grant_secret=approval_test_secret())
    spec = discount(("A1",), 20)
    expired = approve(
        thread_id="t1",
        actions=[(spec.action_id, spec.endpoint, spec.idempotency_key, spec.body)],
        now=int(NOW.timestamp()) - 7200,
        ttl_seconds=3600,
    )
    assert not (await shop.execute(spec, grant=expired)).ok
    # Valid at the shop's time even though that time is in the past for the wall clock.
    assert (await shop.execute(spec, grant=_grant_for(spec))).ok


async def test_auto_low_needs_both_mode_and_low_tier() -> None:
    auto = AutonomySettings({Capability.PROMOTION: AutonomyMode.AUTO_LOW})
    shop = _shop(grant_secret=approval_test_secret(), autonomy=auto)
    assert (await shop.execute(discount(("A1",), 10, days=7))).ok
    assert not (await shop.execute(discount(("A2",), 30, key="k2"))).ok


async def test_injected_failures_and_revert() -> None:
    shop = _shop()
    shop.fail_once_types.add("apply_discount")
    spec = discount(("A1",), 20)
    assert (await shop.execute(spec)).retryable
    assert (await shop.execute(spec)).ok  # the failure did not consume the key
    reverted = await shop.revert(spec.idempotency_key, idempotency_key=f"{spec.idempotency_key}:revert")
    assert reverted.ok and shop.discounts == {}
    again = await shop.revert(spec.idempotency_key, idempotency_key=f"{spec.idempotency_key}:revert")
    assert again == reverted


async def test_discounts_sell_down_dead_stock() -> None:
    shop = _shop()
    before = (await shop.kpis([DEAD_STOCK_VALUE], NOW))[DEAD_STOCK_VALUE]
    await shop.execute(discount(("A1", "A2"), 30))
    shop.advance_days(14)
    after = (await shop.kpis([DEAD_STOCK_VALUE], NOW))[DEAD_STOCK_VALUE]
    assert after < before and shop.recovered_vnd > 0


def test_seed_demo_is_deterministic_and_has_both_kinds() -> None:
    from shop_agent.domain.detectors import default_detectors

    a, b = FakeShop.seed_demo(lambda: NOW), FakeShop.seed_demo(lambda: NOW)
    assert a.snapshot_now() == b.snapshot_now()
    kinds = {o.kind for d in default_detectors() for o in d.detect(a.snapshot_now(), NOW)}
    assert kinds == {"dead_stock", "high_returns"}
