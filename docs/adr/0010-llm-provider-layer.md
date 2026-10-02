# ADR-0010: One LLM layer: Ollama in development, hosted models in production

**Status:** accepted on 2026-09-30 (owner decision D1).

**Context:** the owner wants local models (Ollama) while developing and hosted API models (Claude, GPT or Gemini) in
production, switched by configuration. v1 had two hand-written clients and a rule-based fallback (ADR-0008).

**Decision:**

- `shop_agent/llm.py` is the only module that knows about providers. It maps four roles (planner, writer, judge,
  worker) to `init_chat_model("<provider>:<model>", ...)` specs read from `apps/agent-service/config/llm/<profile>.yaml`,
  selected by `LLM_PROFILE` and overridable per role (`LLM_MODEL_PLANNER=provider:model`). import-linter forbids
  provider packages anywhere else.
- Profiles: `local` (`qwen3.5:9b`), `local-small` (`gemma4:e4b`), `local-large` (`qwen3.6:35b` or `27b`), `anthropic`
  (Claude Sonnet 5.5 for planner/writer/judge, Haiku 4.5 for worker), `openai`, `google`, and `scripted` (tests only).
  Locally one chat model serves every role, so models are never swapped. `shop-agent doctor --suggest-profile`
  measures the hardware and recommends one.
- Structured output uses each provider's native structured output: agents get the raw schema (`create_agent`'s
  `AutoStrategy` picks `ProviderStrategy` when the model profile advertises structured output, `ToolStrategy`
  otherwise) and single calls use `with_structured_output(method="json_schema")`. Forcing a tool call is not an option:
  `ToolStrategy` binds `tool_choice="any"`, which Claude Sonnet 5.5 rejects with a 400 (its profile reports
  `tool_choice: False`). Sampling parameters are not set for Claude models that reject them. Thinking is set explicitly
  (`reasoning`) for Ollama models that think by default; Ollama profiles set `num_ctx` (Ollama's default window is 4,096
  tokens) and `doctor` fails when a prompt would use more than 70% of it.
- One embedding model everywhere: `bge-m3` (1024 dimensions) through Ollama; production runs a small CPU Ollama
  container for embeddings only. The knowledge base records its model and startup refuses a mismatch.
- The gates never call a real model: tests use the scripted model and a hashing embedding. Evals are the only real-model
  tests; they run per profile with separate baselines, and the production profile is the release gate.

**Consequences:** switching provider is a setting; local models are for plumbing and prompt work, not for judging copy
quality; the production provider is confirmed by the Phase 9 eval bake-off.
