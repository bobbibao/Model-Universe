"""The only module that knows about model providers (ADR-0010).

Roles (planner, writer, judge, worker) map to `init_chat_model` specs read from `config/llm/<profile>.yaml`, selected
with `LLM_PROFILE` and overridable per role with `LLM_MODEL_<ROLE>=provider:model`. Every profile file is loaded when
this module is imported, so nothing reads a file inside the server's event loop.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator, Mapping
from enum import StrEnum
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

import yaml
from langchain.agents.middleware import ModelFallbackMiddleware
from langchain.chat_models import init_chat_model
from langchain.embeddings import init_embeddings
from langchain_core.callbacks import AsyncCallbackManagerForLLMRun, CallbackManagerForLLMRun
from langchain_core.embeddings import Embeddings
from langchain_core.language_models import BaseChatModel, LanguageModelInput
from langchain_core.messages import AIMessageChunk, BaseMessage
from langchain_core.outputs import ChatGenerationChunk, ChatResult
from langchain_core.runnables import RunnableConfig, ensure_config
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from pydantic import BaseModel, Field

from shop_agent.config import Settings, get_settings

PROFILES_DIR = Path(__file__).resolve().parents[2] / "config" / "llm"
SCRIPTED = "scripted"
SIMULATOR = "simulator"
EMBEDDING_DIMS = 1024


class SimulatorChatModel(ChatOpenAI):
    """Real HTTP/SSE transport, with the script metadata forwarded only to the local simulator."""

    def _simulation_kwargs(self, manager: Any, kwargs: dict[str, Any]) -> dict[str, Any]:
        return self._metadata_kwargs((manager.metadata if manager else None) or {}, kwargs)

    def _metadata_kwargs(self, metadata: Mapping[str, Any], kwargs: dict[str, Any]) -> dict[str, Any]:
        extra = {**(self.extra_body or {}), **(kwargs.get("extra_body") or {})}
        context = dict(extra.get("simulator") or {})
        context.update({k: metadata[k] for k in ("script_key", "lc_agent_name", "scenario") if k in metadata})
        extra["simulator"] = context
        return {**kwargs, "extra_body": extra}

    # BaseChatModel's public stream methods do not pass their callback manager to _stream/_astream.
    # Forward explicit and inherited RunnableConfig metadata before it is lost at that boundary.
    def stream(
        self,
        input: LanguageModelInput,
        config: RunnableConfig | None = None,
        *,
        stop: list[str] | None = None,
        **kwargs: Any,
    ) -> Iterator[AIMessageChunk]:
        yield from super().stream(
            input, config, stop=stop, **self._metadata_kwargs(ensure_config(config).get("metadata") or {}, kwargs)
        )

    async def astream(
        self,
        input: LanguageModelInput,
        config: RunnableConfig | None = None,
        *,
        stop: list[str] | None = None,
        **kwargs: Any,
    ) -> AsyncIterator[AIMessageChunk]:
        async for chunk in super().astream(
            input, config, stop=stop, **self._metadata_kwargs(ensure_config(config).get("metadata") or {}, kwargs)
        ):
            yield chunk

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        return super()._generate(messages, stop, run_manager, **self._simulation_kwargs(run_manager, kwargs))

    async def _agenerate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: AsyncCallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        return await super()._agenerate(messages, stop, run_manager, **self._simulation_kwargs(run_manager, kwargs))

    def _stream(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> Iterator[ChatGenerationChunk]:
        yield from super()._stream(
            messages, stop=stop, run_manager=run_manager, **self._simulation_kwargs(run_manager, kwargs)
        )

    async def _astream(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: AsyncCallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> AsyncIterator[ChatGenerationChunk]:
        async for chunk in super()._astream(
            messages, stop=stop, run_manager=run_manager, **self._simulation_kwargs(run_manager, kwargs)
        ):
            yield chunk


class ModelRole(StrEnum):
    PLANNER = "planner"  # investigate, growth planning, copilot
    WRITER = "writer"  # customer-facing copy
    JUDGE = "judge"  # brand rubric, eval judge
    WORKER = "worker"  # subagents, learn, summaries


class ModelSpec(BaseModel):
    provider: str
    model: str
    params: dict[str, Any] = Field(default_factory=dict)
    structured_method: Literal["json_schema", "function_calling"] = "json_schema"
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
        if profile.name == SIMULATOR and provider != SIMULATOR:
            raise ValueError(
                f"LLM_PROFILE=simulator requires simulator roles; unset LLM_MODEL_{role.value.upper()} "
                "or select a real profile explicitly"
            )
        params = spec.params if provider == spec.provider else {}
        spec = ModelSpec(
            provider=provider,
            model=model,
            params=params,
            fallbacks=spec.fallbacks,
            structured_method=spec.structured_method if provider == spec.provider else "json_schema",
        )
    return spec


def build_chat_model(spec: ModelSpec, settings: Settings) -> BaseChatModel:
    if spec.provider == SCRIPTED:
        from shop_agent.testing.scripted import ScriptedChatModel

        return ScriptedChatModel.from_directories()

    if spec.provider == SIMULATOR:
        return SimulatorChatModel(
            model=spec.model,
            openai_api_base=settings.llm_simulator_base_url,
            openai_api_key=settings.llm_simulator_api_key,
            use_responses_api=False,
            **spec.params,
        )
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


@lru_cache(maxsize=64)
def _cached_fallback_models(profile_name: str, role: ModelRole) -> tuple[BaseChatModel, ...]:
    settings = get_settings()
    spec = role_spec(role, get_profile(profile_name, settings), settings)
    models = []
    for ref in spec.fallbacks:
        provider, name = parse_model_ref(ref)
        models.append(build_chat_model(ModelSpec(provider=provider, model=name), settings))
    return tuple(models)


def fallback_middleware(role: ModelRole | str, profile: str | None = None) -> ModelFallbackMiddleware | None:
    """`ModelFallbackMiddleware` over the role's fallbacks, or None when the profile lists none."""
    models = _cached_fallback_models(profile or get_settings().llm_profile, ModelRole(role))
    if not models:
        return None
    return ModelFallbackMiddleware(models[0], *models[1:])


def preload(*roles: ModelRole | str) -> None:
    """Build the active profile's models for these roles (and its embeddings) now.

    Graph modules call this at import: the Agent Server imports them before serving, so no model client is built and
    no file is read (scripted answers, certificates) inside its event loop.
    """
    for role in roles:
        chat_model(role)
        fallback_middleware(role)
    embeddings()


StructuredMethod = Literal["json_schema", "function_calling"]


def structured_output_method(role: ModelRole | str, profile: str | None = None) -> StructuredMethod:
    """Use each profile's supported schema transport; scripted responses use function calling."""
    settings = get_settings()
    spec = role_spec(ModelRole(role), get_profile(profile, settings), settings)
    return "function_calling" if spec.provider == SCRIPTED else spec.structured_method


@lru_cache(maxsize=8)
def _cached_embeddings(profile_name: str) -> Embeddings:
    settings = get_settings()
    spec = get_profile(settings.llm_embedding_profile or profile_name, settings).embeddings
    if spec.provider == SIMULATOR:
        return OpenAIEmbeddings(
            model=spec.model,
            dimensions=spec.dims,
            openai_api_base=settings.llm_simulator_base_url,
            openai_api_key=settings.llm_simulator_api_key,
            check_embedding_ctx_length=False,
            max_retries=0,
            request_timeout=15,
        )
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
    return get_profile(get_settings().llm_embedding_profile or profile).embeddings


def reset_caches() -> None:
    """Forget built models (tests that change settings)."""
    _cached_chat_model.cache_clear()
    _cached_fallback_models.cache_clear()
    _cached_embeddings.cache_clear()
