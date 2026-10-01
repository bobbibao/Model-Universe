"""The agent promotes only with price reductions and vouchers (ADR-0014; Decree 81/2018 as amended by 128/2024): no
game of chance, lucky draw, giveaway or loyalty programme, which would need registration or notification. Neither
the agent's actions nor the Agent API offer one."""

from __future__ import annotations

import re
from typing import Any

import yaml

from shop_agent.domain.actions import ACTIONS
from shop_agent.domain.capabilities import Capability
from tests.support.web_double import SPEC

FORBIDDEN = re.compile(r"lottery|lucky|draw|game|sweepstake|raffle|giveaway|contest|loyalty|points|reward", re.I)


def test_no_action_or_endpoint_is_a_game_of_chance_or_a_loyalty_programme() -> None:
    paths: dict[str, Any] = yaml.safe_load(SPEC.read_text("utf-8"))["paths"]
    assert [name for name in ACTIONS if FORBIDDEN.search(name)] == []
    assert [path for path in paths if FORBIDDEN.search(path)] == []


def test_promotions_are_discounts_and_coupons_only() -> None:
    promotion = {name for name, definition in ACTIONS.items() if definition.capability is Capability.PROMOTION}
    assert promotion == {"apply_discount", "create_coupon", "end_promotion"}
