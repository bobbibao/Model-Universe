"""T-08: approvers are the web's active admins; RECIPIENTS_FILE only adds channel handles and is the fallback.
No database: a fake connection stands in for the `analytics.ci_recipients` view."""
import logging

import psycopg
import pytest

from ci_agent.bootstrap.container import build_directory
from ci_agent.config.settings import Settings
from ci_agent.domain.models.notification import ChannelType, Role
from ci_agent.infrastructure.notifications.directory import StaticRecipientDirectory
from ci_agent.infrastructure.notifications.sql_directory import (
    RECIPIENTS_SQL,
    SqlRecipientDirectory,
)

WEB_ADMINS = [{"user_id": "1", "name": "Shop Admin"}, {"user_id": "7", "name": "Second Admin"}]
FILE = StaticRecipientDirectory.from_dicts([
    {"user_id": "1", "name": "From file", "role": "staff", "handles": {"telegram": "555"},
     "preferred_channels": ["telegram"]},
    {"user_id": "99", "name": "Former admin", "role": "owner", "handles": {"email": "old@example.com"},
     "preferred_channels": ["email"]},
])


class FakeConnection:
    def __init__(self, source):
        self.source = source
        self.read_only = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql):
        assert sql == RECIPIENTS_SQL and self.read_only is True  # read-only, the view only
        return self

    def fetchall(self):
        if isinstance(self.source.rows, Exception):
            raise self.source.rows
        return self.source.rows


class Source:
    def __init__(self, rows):
        self.rows, self.reads = rows, 0

    def connect(self, *_args, **_kwargs):
        self.reads += 1
        return FakeConnection(self)


class Clock:
    now = 0.0


def _directory(rows, overlay=FILE, clock=None):
    source, clock = Source(rows), clock or Clock()
    return SqlRecipientDirectory("postgresql://ci_reader@db/shop", overlay, ttl_s=60,
                                 monotonic=lambda: clock.now, connect=source.connect), source, clock


def test_every_active_web_admin_approves_as_owner_with_handles_from_the_file():
    directory, _, _ = _directory(list(WEB_ADMINS))
    first = directory.get("1")
    assert (first.name, first.role, first.handles, first.preferred_channels) == \
        ("Shop Admin", Role.OWNER, {ChannelType.TELEGRAM: "555"}, (ChannelType.TELEGRAM,))
    second = directory.get("7")  # not in the file: web inbox only, nobody messaged elsewhere
    assert (second.role, second.handles, second.preferred_channels) == (Role.OWNER, {}, (ChannelType.WEB,))
    assert [r.user_id for r in directory.approvers_for(Role.OWNER)] == ["1", "7"]
    assert [r.user_id for r in directory.admins()] == ["1", "7"]
    assert directory.resolve_identity(ChannelType.TELEGRAM, "555").user_id == "1"
    assert directory.source == "web"


def test_file_entries_that_are_not_active_web_admins_are_ignored_and_logged_once(caplog):
    directory, _, clock = _directory(list(WEB_ADMINS))
    with caplog.at_level(logging.WARNING):
        assert directory.get("99") is None  # a deactivated admin no longer gets questions
        assert directory.resolve_identity(ChannelType.EMAIL, "old@example.com") is None
        clock.now = 61
        directory.get("1")  # refreshed: same ignored ids, no second warning
    assert caplog.text.count("not active web admins (ignored): 99") == 1


def test_the_list_is_cached_and_refreshed():
    rows = list(WEB_ADMINS)
    directory, source, clock = _directory(rows)
    directory.get("1"), directory.approvers_for(Role.OWNER), directory.admins()
    assert source.reads == 1
    rows.pop()  # admin 7 deactivated in the web
    clock.now = 30
    assert directory.get("7") is not None  # still cached
    clock.now = 61
    assert directory.get("7") is None and source.reads == 2


@pytest.mark.parametrize("error", [psycopg.OperationalError("connection refused"),
                                   psycopg.errors.UndefinedTable("relation analytics.ci_recipients does not exist")])
def test_when_the_view_cannot_be_read_the_file_is_the_fallback(error, caplog):
    directory, source, clock = _directory(error)
    with caplog.at_level(logging.WARNING):
        assert [r.user_id for r in directory.approvers_for(Role.STAFF)] == ["1", "99"]
    assert directory.source == "file (fallback)" and "using RECIPIENTS_FILE (2 entries)" in caplog.text
    directory.get("1")
    assert source.reads == 1  # the failure is cached too: one query per ttl, not per notification
    source.rows = list(WEB_ADMINS)  # the web is back
    clock.now = 61
    assert directory.get("99") is None and directory.source == "web"


def test_without_a_file_web_admins_get_the_web_inbox_only_and_a_failure_means_nobody():
    directory, _, _ = _directory(list(WEB_ADMINS), overlay=None)
    assert all(r.preferred_channels == (ChannelType.WEB,) and not r.handles for r in directory.admins())
    down, _, _ = _directory(psycopg.OperationalError("down"), overlay=None)
    assert down.admins() == []


# wiring ------------------------------------------------------------------------------------------------------

def test_the_web_is_the_default_source_when_the_shop_is_read_from_sql(monkeypatch, tmp_path):
    checked = []
    monkeypatch.setattr(SqlRecipientDirectory, "check", lambda self: checked.append(self))
    settings = Settings(_env_file=None, shop_read_dsn="postgresql://ci_reader:x@localhost/shop")
    assert settings.recipient_source == "web"
    assert isinstance(build_directory(settings), SqlRecipientDirectory) and checked


def test_the_file_alone_when_asked_or_without_sql_reads(tmp_path):
    path = tmp_path / "recipients.json"
    path.write_text('[{"user_id": "1", "role": "owner"}]', encoding="utf-8")
    only_file = Settings(_env_file=None, shop_read_dsn="postgresql://x", recipient_source="file",
                         recipients_file=str(path))
    assert isinstance(build_directory(only_file), StaticRecipientDirectory)
    fake_shop = Settings(_env_file=None, shop_read_adapter="fake", recipients_file=str(path))
    assert isinstance(build_directory(fake_shop), StaticRecipientDirectory)
    assert build_directory(Settings(_env_file=None, shop_read_adapter="fake")).all() == []
