"""Detect: pure functions from a snapshot to opportunities. No I/O, deterministic for the same snapshot."""

from __future__ import annotations

from shop_agent.domain.detectors.base import Detector, default_detectors
from shop_agent.domain.detectors.dead_stock import DeadStockDetector
from shop_agent.domain.detectors.high_returns import HighReturnRateDetector

__all__ = ["DeadStockDetector", "Detector", "HighReturnRateDetector", "default_detectors"]
