from __future__ import annotations

from ci_agent.domain.errors import RuleViolation
from ci_agent.domain.strategies.base import ImprovementStrategy

_STRATEGIES: dict[str, type[ImprovementStrategy]] = {}


def register_strategy(cls: type[ImprovementStrategy]) -> type[ImprovementStrategy]:
    _STRATEGIES[cls.name] = cls
    return cls


def _ensure_loaded() -> None:
    from ci_agent.domain import strategies  # noqa: F401  (import registers the built-ins)


def all_strategies() -> list[ImprovementStrategy]:
    _ensure_loaded()
    return [cls() for cls in _STRATEGIES.values()]


def get_strategy(name: str) -> ImprovementStrategy:
    _ensure_loaded()
    try:
        return _STRATEGIES[name]()
    except KeyError as exc:
        raise RuleViolation(f"Unknown strategy: {name!r}") from exc
