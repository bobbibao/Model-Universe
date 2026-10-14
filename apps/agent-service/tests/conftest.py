"""Hermetic test settings, applied before any graph module is imported.

Graph modules preload their models at import time, so the profile must be fixed before collection: a developer's
`.env` (a paid provider, a demo timer) must never reach the tests, which use only the scripted model (invariant 5).
"""

import os

os.environ["LLM_PROFILE"] = "scripted"
os.environ.pop("LLM_EMBEDDING_PROFILE", None)
for role in ("PLANNER", "WRITER", "JUDGE", "WORKER"):
    os.environ.pop(f"LLM_MODEL_{role}", None)
os.environ.pop("DEMO_MEASURE_AFTER_MINUTES", None)

import httpx  # noqa: E402 - after the environment above
import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _offline_decision_model(monkeypatch: pytest.MonkeyPatch) -> None:
    """The decision model answers 503 unless a test installs its own transport: tests never call the real API."""
    from shop_agent import llm

    def offline(settings: object) -> httpx.AsyncClient:
        transport = httpx.MockTransport(lambda request: httpx.Response(503))
        return httpx.AsyncClient(base_url="https://decision.offline/v1", transport=transport)

    monkeypatch.setattr(llm, "_decision_http", offline)
