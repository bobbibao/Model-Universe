"""Actor-token verification (docs/ROADMAP.md T-04): only short-lived tokens minted with the actor secret,
for this audience and issuer, with a known role, are accepted."""
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from ci_agent.config.settings import Settings
from ci_agent.domain.models.notification import Role
from ci_agent.interfaces.http.auth import (
    InvalidActorToken,
    decode_actor_token,
    mint_actor_token,
)

SETTINGS = Settings(_env_file=None, agent_actor_secret="test-actor-secret-0123456789abcdef")


def _now() -> datetime:
    return datetime.now(UTC)


def _token(secret: str = "test-actor-secret-0123456789abcdef", algorithm: str = "HS256", **overrides) -> str:
    now = _now()
    claims = {"iss": "web-ecommerce", "aud": "ci-agent", "typ": "ci_actor", "sub": "7", "ci_role": "owner",
              "iat": now, "exp": now + timedelta(seconds=60), **overrides}
    return jwt.encode({k: v for k, v in claims.items() if v is not None}, secret, algorithm=algorithm)


def test_minted_token_round_trips_into_a_web_actor():
    actor = decode_actor_token(mint_actor_token("7", Role.MANAGER, SETTINGS, _now()), SETTINGS)
    assert (actor.user_id, actor.role, actor.channel) == ("7", Role.MANAGER, "web")


@pytest.mark.parametrize("token", [
    _token(exp=_now() - timedelta(minutes=5), iat=_now() - timedelta(minutes=6)),  # expired
    _token(aud="someone-else"),
    _token(iss="not-the-web-app"),
    _token(secret="wrong-secret-0123456789abcdefghijk"),
    _token(typ="session"),  # a web session token must not double as an actor token
    _token(typ=None),
    _token(ci_role="admin"),
    _token(ci_role=None),
    _token(sub=None),
    _token(exp=_now() + timedelta(hours=1)),  # longer than the allowed lifetime
    _token(exp=None),  # a token without expiry would never die
    _token(iat=None),  # without iat the lifetime cannot be bounded
    "not-a-jwt",
], ids=["expired", "audience", "issuer", "secret", "typ-session", "typ-missing", "role-unknown", "role-missing",
        "sub-missing", "lifetime", "exp-missing", "iat-missing", "garbage"])
def test_rejected_tokens(token):
    with pytest.raises(InvalidActorToken):
        decode_actor_token(token, SETTINGS)


def test_unsigned_token_is_rejected():
    now = _now()
    unsigned = jwt.encode({"iss": "web-ecommerce", "aud": "ci-agent", "typ": "ci_actor", "sub": "7",
                           "ci_role": "owner", "iat": now, "exp": now + timedelta(seconds=60)}, None, algorithm="none")
    with pytest.raises(InvalidActorToken):
        decode_actor_token(unsigned, SETTINGS)


def test_production_refuses_placeholder_secrets():
    with pytest.raises(ValueError, match="agent_actor_secret"):
        Settings(_env_file=None, app_env="production", shop_api_token="a", web_events_secret="b",
                 signing_secret="c")
    with pytest.raises(ValueError, match="32 bytes"):
        Settings(_env_file=None, app_env="production", shop_api_token="a", web_events_secret="b",
                 signing_secret="c", agent_actor_secret="too-short")
