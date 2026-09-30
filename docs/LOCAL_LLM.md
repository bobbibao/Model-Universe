# Local models (Ollama) for development

The agent runs on local models while you develop and on a hosted model (Claude by default) in production. One setting
switches between them: `LLM_PROFILE` in `apps/agent-service/.env` (ADR-0010). Tests and CI never call a model; they use
the `scripted` profile.

## 1. Install and pull

1. Install Ollama (Windows installer from ollama.com, or `curl -fsSL https://ollama.com/install.sh | sh` on Linux).
2. Pull the default chat model and the embedding model:

   ```bash
   ollama pull qwen3.5:9b
   ollama pull bge-m3
   ```

3. Set these Ollama environment variables (Windows: System Properties > Environment Variables, then restart Ollama):

   | Variable | Value | Why |
   |---|---|---|
   | `OLLAMA_FLASH_ATTENTION` | `1` | less memory for long prompts |
   | `OLLAMA_KV_CACHE_TYPE` | `q8_0` | halves the KV cache, so 16k context fits an 8 GB card |
   | `OLLAMA_MAX_LOADED_MODELS` | `2` | the chat model and the embedding model stay loaded |
   | `OLLAMA_KEEP_ALIVE` | `30m` | no reload between agent runs |

## 2. Choose a profile

```bash
cd apps/agent-service
uv run shop-agent doctor --suggest-profile     # measures VRAM, RAM and qwen3.5:9b tokens/s, recommends a profile
```

| Profile | Chat model (all roles) | Size (Q4) | `num_ctx` | Fits | Notes |
|---|---|---|---|---|---|
| `local` (default) | `qwen3.5:9b` | ~6.6 GB | 16384 | 8 GB VRAM, or 16 GB RAM with offload (slow) | tools and thinking, strong Vietnamese; thinking is off in tool loops |
| `local-small` | `gemma4:e4b` | ~6 GB RAM | 16384 | 4-6 GB VRAM or CPU | plumbing and prompt shape only; weak planner |
| `local-large` | `qwen3.6:35b` (MoE, ~3B active) or `qwen3.6:27b` | ~22-24 GB / ~17 GB | 32768 | 24 GB VRAM or a 32-48 GB Apple-silicon Mac | closest to hosted quality: copilot, local evals |
| (alternative) | `gpt-oss:20b` | ~14 GB | 32768 | 16 GB VRAM | strong tool use, weaker Vietnamese (`LLM_MODEL_<ROLE>=ollama:gpt-oss:20b`) |

Do not use `qwen2.5:3b` (the v1 model; it cannot drive a tool loop) or any model without the `tools` capability.

One model serves every role locally, so Ollama never swaps models. Override a single role with
`LLM_MODEL_PLANNER=ollama:<model>` (also `WRITER`, `JUDGE`, `WORKER`).

## 3. Check it

```bash
uv run shop-agent doctor --profile local --live
```

`--live` asks Ollama whether each model has the `tools` capability and a context at least as long as `num_ctx`, sends
one tool-call probe and one structured-output probe, and embeds a sentence. It also fails when the largest prompt or
playbook would use more than 70% of `num_ctx`: Ollama silently drops the start of a prompt that does not fit.

## 4. Local evals

```bash
uv run poe eval-local --suite smoke            # the same scenarios CI runs with the scripted model
```

Local models are for building plumbing and prompts. Copy quality and planning are judged on the production profile
(`--profile anthropic`), which is the release gate (see `.claude/skills/run-evals`).

## 5. Hosted models

Set `LLM_PROFILE=anthropic` and `ANTHROPIC_API_KEY` in your environment (never in a file in the repo). Embeddings still
use `bge-m3` through Ollama in every profile: changing the embedding model means re-indexing (`shop-agent ingest
--reindex`). `LLM_DAILY_BUDGET_USD` caps what the hosted models may spend per UTC day.
