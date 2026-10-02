from __future__ import annotations

import pytest

from shop_agent import doctor
from shop_agent.config import Settings


@pytest.mark.parametrize(
    ("vram", "speed", "expected"),
    [
        (24.0, None, "local-large"),
        (4.0, 30.0, "local-small"),
        (8.0, 5.0, "local-small"),
        (8.0, 20.0, "local"),
        (None, None, "local"),
        (None, 3.0, "local-small"),
    ],
)
def test_suggest_profile(vram: float | None, speed: float | None, expected: str) -> None:
    assert doctor.suggest_profile(vram, speed)[0] == expected


def test_parse_nvidia_smi() -> None:
    assert doctor.parse_nvidia_smi_mib("8192\n") == 8.0
    assert doctor.parse_nvidia_smi_mib("6144\n24576\n") == 24.0
    assert doctor.parse_nvidia_smi_mib("No devices were found\n") is None


def test_detect_vram_with_a_fake_nvidia_smi() -> None:
    assert doctor.detect_vram_gb(run=lambda _cmd: "8192\n") == 8.0


def test_static_checks_flag_a_missing_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    report = doctor.Report()
    doctor.static_checks("anthropic", Settings(_env_file=None), report)
    assert not report.ok
    assert any("ANTHROPIC_API_KEY unset" in detail for _, _, detail in report.rows)


def test_static_checks_pass_for_local() -> None:
    report = doctor.Report()
    doctor.static_checks("local", Settings(_env_file=None), report)
    assert report.ok, report.render()


def test_ollama_context_length() -> None:
    show = {"model_info": {"qwen35.context_length": 262144, "general.architecture": "qwen35"}}
    assert doctor.ollama_context_length(show) == 262144
