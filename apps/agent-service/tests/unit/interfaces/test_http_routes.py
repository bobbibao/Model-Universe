"""HTTP boundary over the in-memory demo world: every route needs a verified actor, and a decision from
the web moves the improvement exactly as the use case would."""
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from ci_agent.bootstrap.container import Container
from ci_agent.bootstrap.demo import build_demo_world
from ci_agent.config.settings import Settings
from ci_agent.domain.models.improvement import ImprovementStatus
from ci_agent.domain.models.notification import Role
from ci_agent.infrastructure.shop.fake_shop import FakeShop
from ci_agent.infrastructure.shop.sql_read import ShopReadUnavailable
from ci_agent.infrastructure.system.clock import ManualClock
from ci_agent.interfaces.http.app import create_app
from ci_agent.interfaces.http.auth import mint_actor_token
from ci_agent.interfaces.http.dependencies import get_container

SETTINGS = Settings(_env_file=None, agent_actor_secret="test-actor-secret-0123456789abcdef", telegram_webhook_secret=None)


def _auth(role: Role = Role.OWNER, user_id: str = "1") -> dict[str, str]:
    token = mint_actor_token(user_id, role, SETTINGS, datetime.now(UTC))
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def world():
    clock = ManualClock(datetime(2026, 1, 5, 9, tzinfo=UTC))
    return build_demo_world(shop=FakeShop.seed_demo(clock, n_stock=60, n_returns=15, seed=3), clock=clock)


@pytest.fixture()
def client(world):
    app = create_app(SETTINGS)
    app.dependency_overrides[get_container] = lambda: Container(SETTINGS, world.workflow)
    return TestClient(app)


@pytest.mark.parametrize("method,path", [
    ("get", "/improvements"), ("get", "/improvements/x"), ("post", "/improvements/x/decision"),
    ("post", "/runs"), ("get", "/kpi/impact"), ("get", "/cases"),
])
def test_every_route_requires_a_token(client, method, path):
    assert getattr(client, method)(path).status_code == 401
    bad = {"Authorization": "Bearer user1:owner"}  # the old development placeholder no longer works
    assert getattr(client, method)(path, headers=bad).status_code == 401


def test_health_is_public(client):
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("path", ["/kpi/impact", "/cases"])
def test_read_routes_answer_with_a_valid_token(client, path):
    resp = client.get(path, headers=_auth(Role.STAFF))
    assert resp.status_code == 200 and resp.json() == []


def test_runs_need_at_least_a_manager(client):
    assert client.post("/runs", headers=_auth(Role.STAFF)).status_code == 403
    assert client.post("/runs", headers=_auth(Role.MANAGER)).status_code == 202


def test_web_decision_approves_and_advances(client):
    client.post("/runs", headers=_auth())
    pending = client.get("/improvements", params={"status": "awaiting_human"}, headers=_auth()).json()
    assert pending, "the seeded shop should produce at least one open question"
    imp = pending[0]
    assert imp["question_id"] and imp["options"]

    resp = client.post(f"/improvements/{imp['id']}/decision", headers=_auth(user_id="42"),
                       json={"decision": "approve", "option_id": imp["options"][0]["option_id"]})
    assert resp.status_code == 202
    assert resp.json()["status"] == ImprovementStatus.MEASURING.value  # FakeShop Act succeeds immediately

    again = client.post(f"/improvements/{imp['id']}/decision", headers=_auth(),
                        json={"decision": "reject"})
    assert again.status_code == 409


def test_detail_shows_the_whole_story_after_approval(client):
    client.post("/runs", headers=_auth())
    imp = client.get("/improvements", params={"status": "awaiting_human"}, headers=_auth()).json()[0]
    pending = client.get(f"/improvements/{imp['id']}", headers=_auth()).json()
    assert pending["question"]["status"] == "open" and pending["finding"]["causes"]
    assert pending["subject_skus"] and pending["plan"] is None

    option_id = pending["question"]["recommended_option_id"]
    client.post(f"/improvements/{imp['id']}/decision", headers=_auth(user_id="42"),
                json={"decision": "approve", "option_id": option_id})
    done = client.get(f"/improvements/{imp['id']}", headers=_auth()).json()
    assert done["answers"][-1] == {**done["answers"][-1], "decision": "approve", "answered_by": "user:42",
                                   "channel": "web", "option_id": option_id}
    assert done["plan"]["actions"] and done["action_records"]
    assert [h["status"] for h in done["history"]][-3:] == ["acting", "acted", "measuring"]
    assert done["measure_due_at"] is not None


def test_impact_and_cases_after_a_measured_and_a_rejected_improvement(client, world):
    client.post("/runs", headers=_auth())
    first, second = client.get("/improvements", params={"status": "awaiting_human"}, headers=_auth()).json()[:2]
    approved = client.post(f"/improvements/{first['id']}/decision", headers=_auth(),
                           json={"decision": "approve", "option_id": first["options"][0]["option_id"]}).json()
    client.post(f"/improvements/{second['id']}/decision", headers=_auth(), json={"decision": "reject"})

    days = client.get(f"/improvements/{approved['id']}", headers=_auth()).json()["plan"]["evaluate_after_days"] + 1
    world.clock.advance(days=days)
    world.shop.advance_days(days)
    client.post("/runs", headers=_auth())

    (impact,) = client.get("/kpi/impact", headers=_auth()).json()
    assert impact["improvement_id"] == first["id"] and impact["signal_kind"] == first["signal_kind"]
    assert impact["strategy"] == first["options"][0]["strategy"] and impact["auto_approved"] is False
    assert impact["deltas"] and {"name", "improvement_pct", "improved"} <= set(impact["deltas"][0])

    cases = {c["improvement_id"]: c for c in client.get("/cases", headers=_auth()).json()}
    assert cases[first["id"]]["decision"] == f"approved:{impact['strategy']}"
    assert cases[first["id"]]["strategy"] == impact["strategy"] and cases[first["id"]]["outcome_verdict"]
    assert cases[second["id"]]["decision"] == "rejected" and cases[second["id"]]["strategy"] is None


def test_decision_is_attributed_to_the_token_subject(client, world):
    client.post("/runs", headers=_auth())
    imp = client.get("/improvements", params={"status": "awaiting_human"}, headers=_auth()).json()[0]
    client.post(f"/improvements/{imp['id']}/decision", headers=_auth(user_id="42"),
                json={"decision": "reject", "note": "not now"})
    answer = world.workflow.repo.get(imp["id"]).answers[-1]
    assert (answer.answered_by, answer.channel) == ("user:42", "web")


def test_invalid_input_is_a_client_error(client):
    assert client.get("/improvements", params={"status": "nope"}, headers=_auth()).status_code == 400
    assert client.post("/improvements/x/decision", headers=_auth(), json={"decision": "maybe"}).status_code == 422
    assert client.get("/improvements/unknown", headers=_auth()).status_code == 404


def test_telegram_webhook_refuses_updates_without_a_configured_secret(client):
    assert client.post("/webhooks/telegram", json={"callback_query": {}}).status_code == 401


def test_zalo_webhook_is_not_exposed_unless_configured(client):
    assert client.post("/webhooks/zalo", json={}).status_code == 404


def test_amounts_leave_the_api_in_vnd(client, world):
    client.post("/runs", headers=_auth())
    listed = client.get("/improvements", params={"status": "awaiting_human"}, headers=_auth()).json()[0]
    raw = world.workflow.repo.get(listed["id"])
    option = raw.finding.options[0]
    assert listed["options"][0]["est_recovery_value"] == round(option.est_recovery_value * SETTINGS.money_unit_vnd)
    detail = client.get(f"/improvements/{listed['id']}", headers=_auth()).json()
    if "value_at_risk" in raw.signal.metrics:
        assert detail["metrics"]["value_at_risk"] == round(raw.signal.metrics["value_at_risk"] * SETTINGS.money_unit_vnd)


def test_shop_read_failures_are_a_clear_503(client, world, monkeypatch):
    client.post("/runs", headers=_auth())
    pending = client.get("/improvements", params={"status": "awaiting_human"}, headers=_auth()).json()[0]

    def unavailable():
        raise ShopReadUnavailable("analytics views missing: relation does not exist")

    monkeypatch.setattr(world.shop, "snapshot", unavailable)
    run = client.post("/runs", headers=_auth())
    assert run.status_code == 503 and "analytics views missing" in run.json()["detail"]

    decided = client.post(f"/improvements/{pending['id']}/decision", headers=_auth(),
                          json={"decision": "approve", "option_id": pending["options"][0]["option_id"]})
    assert decided.status_code == 503 and decided.json()["detail"].startswith("Decision recorded")
    assert world.workflow.repo.get(pending["id"]).status is ImprovementStatus.APPROVED  # answer kept, continues later
