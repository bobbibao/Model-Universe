"""`reset-agent-data` (phase 1c): deletes all agent state only with the explicit flag, never in production, never
while an agent process is connected, and keeps the schema. Postgres parts run with AGENT_TEST_DATABASE_URL."""

from ci_agent.config import settings as settings_module
from ci_agent.config.settings import Settings
from ci_agent.domain.models.improvement import Improvement
from ci_agent.infrastructure.persistence.postgres.database import (
    SCHEMA_VERSION,
    Database,
)
from ci_agent.infrastructure.persistence.postgres.repository import (
    PostgresImprovementRepository,
)
from ci_agent.interfaces import cli
from tests.conftest import AGENT_TEST_DATABASE_URL, needs_agent_db
from tests.support.factories import NOW, make_signal


def _use(monkeypatch, **values):
    settings = Settings(_env_file=None, **values)
    monkeypatch.setattr(settings_module, "get_settings", lambda: settings)


def test_without_the_flag_nothing_is_deleted(monkeypatch, capsys):
    _use(monkeypatch, database_url="postgresql://u:p@127.0.0.1:1/none")  # never contacted
    assert cli.reset_agent_data(confirmed=False) == 2
    assert "--confirm-delete-all-agent-data" in capsys.readouterr().out


def test_refused_in_production(monkeypatch, capsys):
    _use(monkeypatch, app_env="production", shop_api_token="a", web_events_secret="b", signing_secret="c",
         agent_actor_secret="x" * 32, database_url="postgresql://u:p@127.0.0.1:1/none")
    assert cli.reset_agent_data(confirmed=True) == 2
    assert "not available with APP_ENV=production" in capsys.readouterr().out


@needs_agent_db
def test_refused_while_the_agent_is_running_then_deletes_everything(agent_db, monkeypatch, capsys):
    PostgresImprovementRepository(agent_db).add(Improvement.detect("imp-1", make_signal(), NOW))
    _use(monkeypatch, database_url=AGENT_TEST_DATABASE_URL)
    running = Database.open(AGENT_TEST_DATABASE_URL)  # connects like a running agent
    try:
        assert cli.reset_agent_data(confirmed=True) == 2
        assert "stop it first" in capsys.readouterr().out
    finally:
        running.close()
    assert PostgresImprovementRepository(agent_db).get("imp-1") is not None  # the refusal deleted nothing

    assert cli.reset_agent_data(confirmed=True) == 0
    assert "ci.improvements 1" in capsys.readouterr().out
    assert PostgresImprovementRepository(agent_db).get("imp-1") is None
    with agent_db.transaction() as conn:
        assert conn.execute("SELECT version FROM ci.schema_version").fetchone()["version"] == SCHEMA_VERSION
