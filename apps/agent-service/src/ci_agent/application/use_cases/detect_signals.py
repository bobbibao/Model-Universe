"""Phase 1 - Detect: run detectors over a fresh shop snapshot and open one Improvement per new signal."""
from __future__ import annotations

from dataclasses import replace
from datetime import timedelta
from typing import Sequence

from ci_agent.application.ports.repositories import ImprovementRepository
from ci_agent.application.ports.shop import ShopReadPort
from ci_agent.application.ports.system import ClockPort, IdGeneratorPort
from ci_agent.application.services.recorder import Recorder
from ci_agent.domain.detectors.base import Detector
from ci_agent.domain.models.improvement import Improvement


class DetectSignals:
    def __init__(self, shop: ShopReadPort, detectors: Sequence[Detector], repo: ImprovementRepository,
                 recorder: Recorder, clock: ClockPort, ids: IdGeneratorPort, cooldown_hours: int = 72) -> None:
        self._shop, self._detectors, self._repo = shop, detectors, repo
        self._recorder, self._clock, self._ids = recorder, clock, ids
        self._cooldown = timedelta(hours=cooldown_hours)

    def execute(self) -> list[str]:
        snapshot = self._shop.snapshot()
        now = self._clock.now()
        created: list[str] = []
        for detector in self._detectors:
            for signal in detector.detect(snapshot, now):
                if self._repo.find_by_fingerprint_since(signal.fingerprint, now - self._cooldown):
                    continue  # already being handled, or handled recently
                signal = replace(signal, id=self._ids.new_id())
                imp = Improvement.detect(self._ids.new_id(), signal, now)
                self._recorder.add(imp, "agent", "detected", {"kind": signal.kind, "skus": len(signal.subject_skus)})
                created.append(imp.id)
        return created
