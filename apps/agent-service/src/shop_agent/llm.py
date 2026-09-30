"""The only module that knows about model providers (ADR-0010).

Roles (planner, writer, judge, worker) map to `init_chat_model` specs read from `config/llm/<profile>.yaml`, selected
with `LLM_PROFILE` and overridable per role with `LLM_MODEL_<ROLE>=provider:model`. Every profile file is loaded when
this module is imported, so nothing reads a file inside the server's event loop.
"""

from __future__ import annotations

from enum import StrEnum
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

import yaml
from langchain.agents.middleware import ModelFallbackMiddleware
from langchain.chat_models import init_chat_model
from langchain.embeddings import init_embeddings
from langchain_core.embeddings import Embeddings
from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel, Field

from shop_agent.config import Settings, get_settings

PROFILES_DIR = Path(__file__).resolve().parents[2] / "config" / "llm"
SCRIPTED = "scripted"
EMBEDDING_DIMS = 1024


class ModelRole(StrEnum):
    PLANNER = "planner"  # investigate, growth planning, copilot
    WRITER = "writer"  # customer-facing copy
    JUDGE = "judge"  # brand rubric, eval judge
    WORKER = "worker"  # subagents, learn, summaries


class ModelSpec(BaseModel):
    provider: str
    model: str
    params: dict[str, Any] = Field(default_factory=dict)
    fallbacks: list[str] = Field(default_factory=list, description="provider:model specs tried in order on failure")


class EmbeddingSpec(BaseModel):
    provider: str
    model: str
    dims: int = EMBEDDING_DIMS


class Profile(BaseModel):
    name: str
    description: str = ""
    roles: dict[ModelRole, ModelSpec]
    embeddings: EmbeddingSpec
    prices_usd_per_mtok: dict[str, tuple[float, float]] = Field(default_factory=dict)

    def price(self, model: str) -> tuple[float, float]:
        """(input, output) USD per million tokens; 0 for models without a price (local models)."""
        return self.prices_usd_per_mtok.get(model, (0.0, 0.0))


def _load_profiles(directory: Path) -> dict[str, Profile]:
    profiles: dict[str, Profile] = {}
    for path in sorted(directory.glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        profiles[path.stem] = Profile(name=path.stem, **data)
    return profiles


PROFILES: dict[str, Profile] = _load_profiles(PROFILES_DIR)


def get_profile(name: str | None = None, settings: Settings | None = None) -> Profile:
    settings = settings or get_settings()
    profile_name = name or settings.llm_profile
    try:
        return PROFILES[profile_name]
    except KeyError as exc:
        known = ", ".join(sorted(PROFILES))
        raise ValueError(f"unknown LLM profile {profile_name!r}; known profiles: {known}") from exc


def parse_model_ref(ref: str) -> tuple[str, str]:
    """Split `provider:model` at the first colon (`ollama:qwen3.5:9b` -> `ollama`, `qwen3.5:9b`)."""
    provider, sep, model = ref.partition(":")
    if not sep or not provider or not model:
        raise ValueError(f"model reference {ref!r} must be provider:model")
    return provider, model


def role_spec(role: ModelRole, profile: Profile, settings: Settings) -> ModelSpec:
    spec = profile.roles[role]
    override: str | None = getattr(settings, f"llm_model_{role.value}")
    if override:
        provider, model = parse_model_ref(override)
        params = spec.params if provider == spec.provider else {}
        spec = ModelSpec(provider=provider, model=model, params=params, fallbacks=spec.fallbacks)
    return spec


def build_chat_model(spec: ModelSpec, settings: Settings) -> BaseChatModel:
    if spec.provider == SCRIPTED:
        from shop_agent.testing.scripted import ScriptedChatModel

        return ScriptedChatModel.from_directories()
    kwargs = dict(spec.params)
    if spec.provider == "ollama":
        kwargs.setdefault("base_url", settings.ollama_base_url)
    model = init_chat_model(spec.model, model_provider=spec.provider, **kwargs)
    assert isinstance(model, BaseChatModel)  # noqa: S101 - init_chat_model returns a configurable model only for None
    return model


@lru_cache(maxsize=64)
def _cached_chat_model(profile_name: str, role: ModelRole) -> BaseChatModel:
    settings = get_settings()
    return build_chat_model(role_spec(role, get_profile(profile_name, settings), settings), settings)


def chat_model(role: ModelRole | str, profile: str | None = None) -> BaseChatModel:
    """The chat model for a role in the active (or named) profile."""
    return _cached_chat_model(profile or get_settings().llm_profile, ModelRole(role))


def model_name(role: ModelRole | str, profile: str | None = None) -> str:
    settings = get_settings()
    return role_spec(ModelRole(role), get_profile(profile, settings), settings).model


def fallback_middleware(role: ModelRole | str, profile: str | None = None) -> ModelFallbackMiddleware | None:
    """`ModelFallbackMiddleware` over the role's fallbacks, or None when the profile lists none."""
    settings = get_settings()
    spec = role_spec(ModelRole(role), get_profile(profile, settings), settings)
    if not spec.fallbacks:
        return None
    models = []
    for ref in spec.fallbacks:
        provider, name = parse_model_ref(ref)
        models.append(build_chat_model(ModelSpec(provider=provider, model=name), settings))
    return ModelFallbackMiddleware(models[0], *models[1:])


StructuredMethod = Literal["json_schema", "function_calling"]


def structured_output_method(role: ModelRole | str, profile: str | None = None) -> StructuredMethod:
    """Native structured output everywhere it exists; see ADR-0010 (forced tool choice breaks Claude Sonnet 5.5)."""
    settings = get_settings()
    spec = role_spec(ModelRole(role), get_profile(profile, settings), settings)
    return "function_calling" if spec.provider == SCRIPTED else "json_schema"


@lru_cache(maxsize=8)
def _cached_embeddings(profile_name: str) -> Embeddings:
    settings = get_settings()
    spec = get_profile(profile_name, settings).embeddings
    if spec.provider == SCRIPTED:
        from shop_agent.testing.embeddings import HashingEmbedding

        return HashingEmbedding(size=spec.dims)
    kwargs: dict[str, Any] = {}
    if spec.provider == "ollama":
        kwargs["base_url"] = settings.ollama_base_url
    return init_embeddings(spec.model, provider=spec.provider, **kwargs)


def embeddings(profile: str | None = None) -> Embeddings:
    return _cached_embeddings(profile or get_settings().llm_profile)


def embedding_spec(profile: str | None = None) -> EmbeddingSpec:
    return get_profile(profile).embeddings


def reset_caches() -> None:
    """Forget built models (tests that change settings)."""
    _cached_chat_model.cache_clear()
    _cached_embeddings.cache_clear()
