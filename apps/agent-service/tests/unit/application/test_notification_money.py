"""Question notification option lines (T-03c place 3): historical text by default, VND when configured."""
from datetime import timedelta

from ci_agent.application.services.notification_factory import NotificationFactory
from ci_agent.domain.models.human import Question
from ci_agent.domain.models.improvement import Improvement
from ci_agent.domain.models.money import MoneyFormat
from ci_agent.domain.models.notification import Recipient, Role
from ci_agent.infrastructure.system.clock import ManualClock
from ci_agent.infrastructure.system.ids import SequentialIds
from ci_agent.infrastructure.system.signer import HmacTokenSigner
from tests.support.factories import NOW, make_option, make_signal


def _body(money: MoneyFormat | None) -> str:
    imp = Improvement.detect("imp-1", make_signal(), NOW)
    question = Question(id="q-1", improvement_id="imp-1", prompt="Which?", context="Why",
                        options=(make_option(recovery=31454.2, cost=0.0),), created_at=NOW,
                        expires_at=NOW + timedelta(hours=48), recommended_option_id="discount")
    factory = NotificationFactory(ManualClock(NOW), SequentialIds(), HmacTokenSigner("s"), money=money)
    return factory.question(imp, question, Recipient("1", "Admin", Role.OWNER)).body


def test_option_lines_keep_the_historical_text_by_default():
    assert "1. discount option (recommended) - est. recovery 31,454, cost 0, risk low" in _body(None)


def test_option_lines_in_vnd():
    assert "1. discount option (recommended) - est. recovery 786.355.000 ₫, cost 0 ₫, risk low" in _body(MoneyFormat(25_000))
