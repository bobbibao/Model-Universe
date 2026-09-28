"""Detector (Detect phase): pure functions from a shop snapshot to signals."""
from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from typing import ClassVar

from ci_agent.domain.models.shop import ShopSnapshot
from ci_agent.domain.models.signal import Signal


class Detector(ABC):
    kind: ClassVar[str]

    @abstractmethod
    def detect(self, snapshot: ShopSnapshot, now: datetime) -> list[Signal]:
        """Return zero or more signals. Must be deterministic and free of I/O."""


_DETECTORS: list[type[Detector]] = []


def register_detector(cls: type[Detector]) -> type[Detector]:
    _DETECTORS.append(cls)
    return cls


def default_detectors() -> list[Detector]:
    from ci_agent.domain import detectors  # noqa: F401  (import registers the built-ins)

    return [cls() for cls in _DETECTORS]
