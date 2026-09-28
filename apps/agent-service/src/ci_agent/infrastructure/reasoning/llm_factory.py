"""Provider-agnostic chat model factory (dict dispatch, no if/else). Heavy imports stay lazy."""
from __future__ import annotations

from functools import lru_cache
from typing import Any, Callable


def _anthropic(model: str, api_key: str | None, api_base: str | None) -> Any:
    from langchain_anthropic import ChatAnthropic

    return ChatAnthropic(model=model, api_key=api_key, timeout=60, max_retries=2)


def _ollama(model: str, api_key: str | None, api_base: str | None) -> Any:
    from langchain_ollama import ChatOllama

    return ChatOllama(model=model, base_url=api_base or "http://localhost:11434")


_BUILDERS: dict[str, Callable[[str, str | None, str | None], Any]] = {
    "anthropic": _anthropic,
    "ollama": _ollama,
}


@lru_cache
def get_llm(provider: str, model: str, api_key: str | None = None, api_base: str | None = None) -> Any:
    try:
        builder = _BUILDERS[provider]
    except KeyError as exc:
        raise ValueError(f"Unknown LLM provider {provider!r}; supported: {sorted(_BUILDERS)}") from exc
    return builder(model, api_key, api_base)
