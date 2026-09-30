"""`shop-agent doctor`: checks that the configured models can drive the agents (ADR-0010).

Static checks need nothing running. `--live` sends one tool-call and one structured-output probe per role, asks Ollama
for each local model's capabilities and context length, and embeds a sentence. `--suggest-profile` measures the machine
(VRAM, RAM, tokens per second) and recommends a local profile. It never changes configuration.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from pydantic import BaseModel

from shop_agent import llm
from shop_agent.config import Settings, get_settings

PROMPT_SHARE_LIMIT = 0.70  # a rendered prompt may use at most 70% of num_ctx
CHARS_PER_TOKEN = 3.0  # conservative for Vietnamese text
PROVIDER_KEYS = {"anthropic": "ANTHROPIC_API_KEY", "openai": "OPENAI_API_KEY", "google_genai": "GOOGLE_API_KEY"}
PROMPT_DIRS = (Path(__file__).resolve().parent / "agents" / "prompts", Path(__file__).resolve().parents[2] / "skills")
BENCHMARK_MODEL = "qwen3.5:9b"


@dataclass
class Report:
    rows: list[tuple[str, bool, str]] = field(default_factory=list)

    def add(self, name: str, ok: bool, detail: str = "") -> None:
        self.rows.append((name, ok, detail))

    @property
    def ok(self) -> bool:
        return all(passed for _, passed, _ in self.rows)

    def render(self) -> str:
        width = max((len(name) for name, _, _ in self.rows), default=10)
        return "\n".join(f"{'PASS' if ok else 'FAIL'}  {name.ljust(width)}  {detail}" for name, ok, detail in self.rows)


class Probe(BaseModel):
    ok: bool
    word: str


@tool
def get_server_time(timezone: str) -> str:
    """Return the current time in a timezone."""
    return f"12:00 {timezone}"


def largest_prompt_tokens() -> int:
    """Estimated tokens of the largest prompt or playbook an agent can load at once."""
    sizes = [path.stat().st_size for d in PROMPT_DIRS if d.exists() for path in d.rglob("*.md")]
    return int(max(sizes, default=0) / CHARS_PER_TOKEN)


def static_checks(profile_name: str | None, settings: Settings, report: Report) -> None:
    try:
        profile = llm.get_profile(profile_name, settings)
    except ValueError as exc:
        report.add("profile", False, str(exc))
        return
    report.add("profile", True, f"{profile.name}: {profile.description}")
    for role in llm.ModelRole:
        spec = llm.role_spec(role, profile, settings)
        env = PROVIDER_KEYS.get(spec.provider)
        has_key = env is None or bool(os.environ.get(env))
        report.add(
            f"role {role.value}", has_key, f"{spec.provider}:{spec.model}" + ("" if has_key else f" ({env} unset)")
        )
        num_ctx = spec.params.get("num_ctx")
        if spec.provider == "ollama":
            prompt_tokens = largest_prompt_tokens()
            fits = isinstance(num_ctx, int) and prompt_tokens <= PROMPT_SHARE_LIMIT * num_ctx
            report.add(f"num_ctx {role.value}", fits, f"largest prompt ~{prompt_tokens} tokens, num_ctx={num_ctx}")
    report.add(
        "embeddings",
        profile.embeddings.dims == llm.EMBEDDING_DIMS,
        f"{profile.embeddings.provider}:{profile.embeddings.model} ({profile.embeddings.dims} dims)",
    )


def ollama_show(base_url: str, model: str) -> dict[str, Any]:
    response = httpx.post(f"{base_url.rstrip('/')}/api/show", json={"model": model}, timeout=15.0)
    response.raise_for_status()
    data: dict[str, Any] = response.json()
    return data


def ollama_context_length(show: dict[str, Any]) -> int | None:
    for key, value in (show.get("model_info") or {}).items():
        if key.endswith(".context_length") and isinstance(value, int):
            return value
    return None


def live_checks(profile_name: str | None, settings: Settings, report: Report) -> None:
    profile = llm.get_profile(profile_name, settings)
    seen: set[tuple[str, str]] = set()
    for role in llm.ModelRole:
        spec = llm.role_spec(role, profile, settings)
        if (spec.provider, spec.model) in seen:
            continue
        seen.add((spec.provider, spec.model))
        label = f"{spec.provider}:{spec.model}"
        if spec.provider == "ollama":
            try:
                show = ollama_show(settings.ollama_base_url, spec.model)
            except httpx.HTTPError as exc:
                report.add(f"ollama {label}", False, f"not available: {exc}")
                continue
            capabilities = show.get("capabilities") or []
            report.add(f"tools capability {label}", "tools" in capabilities, f"capabilities={capabilities}")
            context = ollama_context_length(show)
            num_ctx = spec.params.get("num_ctx")
            enough = context is not None and isinstance(num_ctx, int) and context >= num_ctx
            report.add(f"context {label}", enough, f"model context={context}, num_ctx={num_ctx}")
        model = llm.build_chat_model(spec, settings)
        config: RunnableConfig = {"metadata": {"script_key": "doctor.tool_probe"}}
        try:
            reply = model.bind_tools([get_server_time]).invoke(
                [
                    HumanMessage(
                        "Call the get_server_time tool for the timezone Asia/Ho_Chi_Minh. Do not answer in text."
                    )
                ],
                config,
            )
            called = [c["name"] for c in getattr(reply, "tool_calls", [])]
            report.add(f"tool call {label}", "get_server_time" in called, f"calls={called}")
        except Exception as exc:
            report.add(f"tool call {label}", False, repr(exc)[:200])
        try:
            method = "function_calling" if spec.provider == llm.SCRIPTED else "json_schema"
            probe = model.with_structured_output(Probe, method=method).invoke(
                "Answer with ok=true and word='xin chào'.", {"metadata": {"script_key": "doctor.structured_probe"}}
            )
            report.add(f"structured output {label}", isinstance(probe, Probe) and probe.ok, repr(probe)[:120])
        except Exception as exc:
            report.add(f"structured output {label}", False, repr(exc)[:200])
    try:
        vector = llm.embeddings(profile.name).embed_query("xin chào")
        report.add("embedding probe", len(vector) == llm.EMBEDDING_DIMS, f"{len(vector)} dims")
    except Exception as exc:
        report.add("embedding probe", False, repr(exc)[:200])


# ------------------------------------------------------------------------------------------------ profile suggestion


def parse_nvidia_smi_mib(output: str) -> float | None:
    """Largest GPU memory in GB from `nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits`."""
    values = [float(line.strip()) for line in output.splitlines() if line.strip().replace(".", "", 1).isdigit()]
    return max(values) / 1024 if values else None


def detect_vram_gb(run: Callable[[list[str]], str] | None = None) -> float | None:
    if run is None:
        if shutil.which("nvidia-smi") is None:
            return None

        def run(command: list[str]) -> str:
            return subprocess.run(command, capture_output=True, text=True, check=False, timeout=10).stdout  # noqa: S603

    return parse_nvidia_smi_mib(run(["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"]))


def detect_ram_gb() -> float | None:
    try:
        return os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 1024**3
    except (ValueError, OSError, AttributeError):
        return None


def benchmark_tokens_per_second(base_url: str, model: str = BENCHMARK_MODEL) -> float | None:
    """Generation speed from Ollama's own counters (eval_count / eval_duration); None if unavailable."""
    try:
        response = httpx.post(
            f"{base_url.rstrip('/')}/api/generate",
            json={
                "model": model,
                "prompt": "Viết ba câu giới thiệu một cửa hàng thời trang.",
                "stream": False,
                "options": {"num_predict": 128},
            },
            timeout=120.0,
        )
        response.raise_for_status()
        data = response.json()
        return float(data["eval_count"]) / (float(data["eval_duration"]) / 1e9)
    except (httpx.HTTPError, KeyError, ValueError, ZeroDivisionError):
        return None


def suggest_profile(vram_gb: float | None, tokens_per_second: float | None) -> tuple[str, str]:
    """(profile, reason) from the measurements (docs/LOCAL_LLM.md)."""
    if vram_gb is not None and vram_gb >= 20:
        return "local-large", f"{vram_gb:.0f} GB VRAM fits qwen3.6:35b"
    if vram_gb is not None and vram_gb < 6:
        return "local-small", f"{vram_gb:.1f} GB VRAM is below the 6 GB qwen3.5:9b needs"
    if tokens_per_second is not None and tokens_per_second < 8:
        return "local-small", f"qwen3.5:9b generates only {tokens_per_second:.1f} tokens/s here"
    if vram_gb is None and tokens_per_second is None:
        return "local", "no GPU or Ollama measurement available; start with the default"
    return "local", "qwen3.5:9b fits this machine"


def run(profile: str | None, live: bool, suggest: bool) -> int:
    settings = get_settings()
    if suggest:
        vram = detect_vram_gb()
        ram = detect_ram_gb()
        speed = benchmark_tokens_per_second(settings.ollama_base_url)
        name, reason = suggest_profile(vram, speed)
        print(f"VRAM: {vram if vram is None else round(vram, 1)} GB, RAM: {ram if ram is None else round(ram, 1)} GB, ")
        print(f"qwen3.5:9b speed: {speed if speed is None else round(speed, 1)} tokens/s")
        print(f"Recommended profile: {name} ({reason})\nPut this in apps/agent-service/.env:  LLM_PROFILE={name}")
        return 0
    report = Report()
    static_checks(profile, settings, report)
    if live and report.ok:
        live_checks(profile, settings, report)
    print(report.render())
    return 0 if report.ok else 1
