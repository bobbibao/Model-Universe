"""The loop's invariants (docs/ARCHITECTURE_V2.md section 11), proved on the real `improvement` graph."""

from __future__ import annotations

from typing import Any

import pytest

from shop_agent.domain.capabilities import Capability
from shop_agent.domain.options import plan_option
from shop_agent.domain.policies.autonomy import AutonomyMode, AutonomySettings
from shop_agent.graphs.improvement import CASES, FOLLOWUPS, MAX_RESPONDS
from tests.graphs.conftest import World


async def test_no_write_without_approval(world: World) -> None:
    result = await world.start()
    assert result["stage"] == "reviewing" and world.shop.sent == []  # nothing is written before a decision
    payload = world.review(result)
    out = await world.resume({"type": "approve", "option_id": payload["recommended_option_id"], "approver": "x"})
    assert out["outcome"] == "failed" and out["stage"] == "closed"
    assert world.shop.applied() == [] and [w.applied for w in world.shop.sent] == [False]  # refused: no grant


async def test_edit_runs_edited_body(world: World) -> None:
    payload = world.review(await world.start())
    out = await world.approve(payload, args={"percent": 25})
    assert out["stage"] == "measuring"
    [discount] = world.shop.applied("pricing/discounts")
    assert discount.body["percent"] == 25.0
    assert discount.idempotency_key == f"{world.thread_id}:discount:1"
    assert out["decision"]["args"] == {"percent": 25}


async def test_edit_outside_editable_fields_or_limits_is_refused(world: World) -> None:
    payload = world.review(await world.start())
    option = payload["recommended_option_id"]
    again = await world.resume({"type": "edit", "option_id": option, "args": {"skus": ["BEST"]}})
    assert "cannot be edited" in world.review(again)["error"]
    again = await world.resume({"type": "edit", "option_id": option, "args": {"percent": 60}})
    assert "above the limit" in world.review(again)["error"]
    assert world.shop.sent == []


async def test_reject_runs_nothing(world: World) -> None:
    world.review(await world.start())
    out = await world.resume({"type": "reject", "note": "Sắp có hàng mới, chưa xả", "approver": "owner"})
    assert (out["outcome"], out["stage"]) == ("rejected", "closed") and world.shop.sent == []
    case = await world.store.aget((*CASES, "dead_stock"), world.thread_id)
    assert case is not None and "owner note: Sắp có hàng mới, chưa xả" in case.value["text"]
    assert case.value["lessons"]


async def test_respond_loops_to_investigate(world: World) -> None:
    world.review(await world.start())
    for n in range(1, MAX_RESPONDS + 1):
        payload = world.review(await world.resume({"type": "respond", "note": f"câu hỏi {n}"}))
        values = await world.values()
        assert values["investigations"] == n + 1 and values["responses"][-1] == f"câu hỏi {n}"
    assert "respond" not in payload["allowed_decisions"]
    refused = await world.resume({"type": "respond", "note": "thêm nữa"})
    assert "at most" in world.review(refused)["error"]


async def test_idempotent_retry_after_failure(world: World) -> None:
    world.shop.fail_once_types.add("create_task")  # step 2 fails once with a retryable error
    payload = world.review(await world.start())
    out = await world.approve(payload)
    assert out["stage"] == "measuring" and all(s["ok"] for s in out["steps"])
    assert len(world.shop.applied("pricing/discounts")) == 1  # step 1 was replayed by key, not applied twice
    assert len(world.shop.applied("tasks")) == 1


async def test_compensation_on_failed_step(world: World) -> None:
    world.shop.fail_types.add("create_task")
    payload = world.review(await world.start())
    out = await world.approve(payload)
    assert (out["outcome"], out["stage"]) == ("failed", "closed")
    first, second = out["steps"]
    assert first["ok"] and first["reverted"] and not second["ok"]
    assert world.shop.discounts == {}  # the discount was reverted
    assert await world.store.aget(FOLLOWUPS, world.thread_id) is None


class CrashAfterFirstWrite:
    """A writer whose process dies right after the first write reached the shop."""

    def __init__(self, inner: Any) -> None:
        self.inner, self.crashed = inner, False

    async def execute(self, action: Any, **kwargs: Any) -> Any:
        result = await self.inner.execute(action, **kwargs)
        if not self.crashed:
            self.crashed = True
            raise RuntimeError("process killed")
        return result

    async def revert(self, of_key: str, **kwargs: Any) -> Any:
        return await self.inner.revert(of_key, **kwargs)


async def test_crash_after_baseline_resumes_without_duplicate(world: World) -> None:
    payload = world.review(await world.start())
    world.deps.writer = CrashAfterFirstWrite(world.shop)
    with pytest.raises(RuntimeError, match="process killed"):
        await world.approve(payload)
    before = await world.values()
    assert before["stage"] == "acting" and before["baseline"]  # the baseline is checkpointed before the writes
    out = await world.run(None)  # the retried run continues from the checkpoint
    assert out["stage"] == "measuring" and out["baseline"] == before["baseline"]
    assert len(world.shop.applied("pricing/discounts")) == 1 and len(world.shop.applied("tasks")) == 1


async def test_reentry_measure_learn(world: World) -> None:
    payload = world.review(await world.start())
    await world.approve(payload)
    early = await world.run({"wake": "followup_due"})
    assert early["stage"] == "measuring"  # not due yet: nothing happens
    world.clock.advance(days=15)
    world.shop.advance_days(15)
    out = await world.run({"wake": "followup_due"})
    assert (out["stage"], out["outcome"]) == ("closed", "measured")
    assert out["measurement"]["verdict"] in ("success", "inconclusive", "negative")
    assert await world.store.aget(FOLLOWUPS, world.thread_id) is None
    case = await world.store.aget((*CASES, "dead_stock"), world.thread_id)
    assert case is not None and "result:" in case.value["text"]


async def test_validate_discards_model_numbers(world: World, scripts: Any) -> None:
    proposal = {
        "summary": "Hàng tồn lâu",
        "causes": [{"text": "Giá cao", "confidence": 0.5}],
        "sop_refs": ["SOP-001"],
        "options": [
            {"option_id": "discount", "strategy": "discount", "percent": 25, "duration_days": 10,
             "rationale": "Mô hình tự đoán thu về 999.999.999 ₫"},
            {"option_id": "deep", "strategy": "discount", "percent": 60, "duration_days": 10, "rationale": "Giảm sâu"},
        ],
        "recommended_option_id": "deep",
        "confidence": 0.9,
    }  # fmt: skip
    scripts({"improvement.investigate.dead_stock": [{"tool_calls": [{"name": "Proposal", "args": proposal}]}]})
    payload = world.review(await world.start())
    shown = {o["option_id"]: o for o in payload["options"]}
    assert set(shown) == {"discount", "do_nothing"}  # the over-limit option is dropped; "do nothing" is added
    assert payload["recommended_option_id"] == "discount"
    snapshot = world.shop.snapshot_now(world.clock())
    expected = plan_option(
        "discount", {"percent": 25, "duration_days": 10}, world.opportunity(), snapshot, world.clock()
    )
    assert shown["discount"]["estimate"]["recovery_vnd"] == expected.estimate.recovery_vnd
    dropped = next(o for o in (await world.values())["options"] if o["option_id"] == "deep")
    assert dropped["violations"] == ["discount 60% is above the limit of 40%"]


async def test_auto_low_risk_skips_interrupt(world: World, scripts: Any) -> None:
    auto = AutonomySettings({Capability.PROMOTION: AutonomyMode.AUTO_LOW, Capability.OPS_TASKS: AutonomyMode.AUTO_LOW})
    world.deps.autonomy = world.shop.autonomy = auto
    proposal = {
        "summary": "s", "causes": [], "sop_refs": [], "confidence": 0.7, "recommended_option_id": "discount",
        "options": [{"option_id": "discount", "strategy": "discount", "percent": 10, "duration_days": 7,
                     "rationale": "r"}],
    }  # fmt: skip
    scripts({"improvement.investigate.dead_stock": [{"tool_calls": [{"name": "Proposal", "args": proposal}]}]})
    out = await world.start()
    assert "__interrupt__" not in out and out["stage"] == "measuring"
    assert out["decision"]["mode"] == "auto" and out["decision"]["grant"] is None
    assert [w.grant for w in world.shop.applied()] == [False, False]  # accepted by the shop's auto_low rule


async def test_shadow_records_without_writing(world: World) -> None:
    world.deps.autonomy = AutonomySettings({Capability.PROMOTION: AutonomyMode.SHADOW})
    out = await world.start()
    assert (out["outcome"], out["stage"]) == ("shadow", "closed") and world.shop.sent == []


async def test_grant_replay_rejected(world: World) -> None:
    payload = world.review(await world.start())
    grant = world.grant(payload)
    await world.resume({"type": "approve", "option_id": payload["recommended_option_id"], "grant": grant})
    world.thread_id = "thread-2"  # the same situation on another thread: other idempotency keys
    other = world.review(await world.start())
    out = await world.resume({"type": "approve", "option_id": other["recommended_option_id"], "grant": grant})
    assert out["outcome"] == "failed"
    assert {w.idempotency_key.split(":")[0] for w in world.shop.applied()} == {"thread-1"}


async def test_high_returns_repackages_and_restocks(world: World) -> None:
    payload = world.review(await world.start("high_returns"))
    assert payload["recommended_option_id"] == "repackage" and payload["sop_refs"] == ["SOP-002"]
    out = await world.approve(payload)
    assert out["stage"] == "measuring" and world.shop.statuses == {"RET": "restock"}
