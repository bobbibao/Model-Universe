"""How the shop-read adapter is chosen: sql by default and only with a DSN, fake refused in production."""
import pytest

from ci_agent.bootstrap.container import build_shop_read
from ci_agent.config.settings import Settings
from ci_agent.infrastructure.shop.fake_shop import FakeShop
from ci_agent.infrastructure.system.clock import ManualClock

PRODUCTION = {"app_env": "production", "shop_api_token": "a", "web_events_secret": "b", "signing_secret": "c",
              "agent_actor_secret": "x" * 32}


def test_sql_is_the_default_and_needs_a_dsn():
    settings = Settings(_env_file=None)
    assert settings.shop_read_adapter == "sql" and settings.shop_read_dsn is None
    with pytest.raises(RuntimeError, match="needs SHOP_READ_DSN"):
        build_shop_read(settings, ManualClock())


def test_fake_is_available_in_development_only():
    assert isinstance(build_shop_read(Settings(_env_file=None, shop_read_adapter="fake"), ManualClock()), FakeShop)
    with pytest.raises(ValueError, match="development only"):
        Settings(_env_file=None, shop_read_adapter="fake", **PRODUCTION)


def test_money_unit_must_be_positive():
    with pytest.raises(ValueError, match="MONEY_UNIT_VND must be positive"):
        Settings(_env_file=None, money_unit_vnd=0)
