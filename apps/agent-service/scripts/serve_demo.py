"""Development harness: serve the real agent HTTP app on http://127.0.0.1:8000 over the in-memory demo world
(FakeShop, rule-based reasoner), pre-run for 45 simulated days so it already has measured and closed
improvements, a rejection, and new open questions. Lets the web CI Console's impact and case pages show data.

Run from apps/agent-service with the same AGENT_ACTOR_SECRET as the web app:
    AGENT_ACTOR_SECRET=<value> python scripts/serve_demo.py

Nothing is written to the web shop: Act runs against FakeShop, and events go to an in-memory recorder.
"""
import os
import sys

import uvicorn

from ci_agent.application.use_cases.submit_answer import Actor, SubmitAnswerCommand
from ci_agent.bootstrap.container import Container
from ci_agent.bootstrap.demo import build_demo_world
from ci_agent.config.settings import Settings
from ci_agent.domain.models.human import AnswerDecision
from ci_agent.domain.models.notification import Role
from ci_agent.interfaces.http.app import create_app
from ci_agent.interfaces.http.dependencies import get_container

actor_secret = os.environ.get("AGENT_ACTOR_SECRET", "")
if not actor_secret:
    sys.exit("Set AGENT_ACTOR_SECRET to the same value as in apps/web-ecommerce/.env")

world = build_demo_world()
for round_no in range(3):
    world.workflow.coordinator.tick()
    for n, imp in enumerate(world.workflow.repo.list_recent(100)):
        q = imp.current_question
        if q is None:
            continue
        decision = AnswerDecision.REJECT if (round_no, n) == (0, 1) else AnswerDecision.APPROVE
        option = None if decision is AnswerDecision.REJECT else (q.recommended_option_id or q.options[0].option_id)
        world.workflow.coordinator.submit_answer(SubmitAnswerCommand(q.id, decision, Actor("1", Role.OWNER, "web"),
                                                                     option, note="demo"))
    world.clock.advance(days=15)
    world.shop.advance_days(15)
    world.workflow.coordinator.tick()

print({s: sum(1 for i in world.workflow.repo.list_recent(100) if i.status.value == s) for s in ("closed", "awaiting_human")},
      flush=True)
settings = Settings(_env_file=None, agent_actor_secret=actor_secret)
app = create_app(settings)
app.dependency_overrides[get_container] = lambda: Container(settings, world.workflow)
uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")
