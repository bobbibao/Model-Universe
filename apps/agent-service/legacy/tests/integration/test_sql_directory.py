"""T-08 against the real web database: the `analytics.ci_recipients` view (created by the web app at startup) is
readable by the read-only ci_reader role and lists the active admins. Skipped unless SHOP_READ_TEST_DSN is set (see
test_sql_shop_read.py)."""
import os

import pytest

from ci_agent.domain.models.notification import ChannelType, Role
from ci_agent.infrastructure.notifications.sql_directory import SqlRecipientDirectory

DSN = os.environ.get("SHOP_READ_TEST_DSN", "")
pytestmark = pytest.mark.skipif(not DSN, reason="set SHOP_READ_TEST_DSN to run")


def test_the_web_admins_are_the_approvers():
    directory = SqlRecipientDirectory(DSN)
    approvers = directory.approvers_for(Role.OWNER)
    assert directory.source == "web", "analytics.ci_recipients should be readable (restart the web app once)"
    assert approvers and all(r.role is Role.OWNER and r.name for r in approvers)
    assert all(r.preferred_channels == (ChannelType.WEB,) and not r.handles for r in approvers)  # no file: inbox only
