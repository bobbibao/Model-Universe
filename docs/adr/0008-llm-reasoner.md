# ADR-0008: The LLM reasoner explains; the rules still decide

**Context:** ROADMAP T-01 replaces the rule-based texts of Investigate, Ask and Learn with LLM-written ones. The
original stub planned a LangGraph tool-calling agent per method. Investigate already assembles every fact
deterministically (stock, returns, sales velocity, SOP excerpts, similar cases, admin notes), so a tool loop would add
latency, cost and attack surface without adding data.

**Decision (owner-approved for T-01):**

- One `LlmReasoner` (`infrastructure/reasoning/llm_reasoner.py`) implements `ReasoningPort` for two providers,
  selected by `LLM_PROVIDER`: `ollama` (native chat API, JSON schema in `format`; the first target, `qwen2.5:3b`, no
  key) and `claude` (official `anthropic` SDK, `messages.parse` with the schema as `output_format`, effort `low`,
  default `claude-sonnet-5`, key from `ANTHROPIC_API_KEY` only). Prompts, the facts shown, output validation and the
  fallback are shared; only the client (`llm_clients.py`) differs. LangGraph/LangChain are no longer dependencies.
- **No tools.** A call is one system + user message in, one JSON object out. The package imports no write path (a
  test checks it). ADR-0003 holds by construction.
- **No numbers from the LLM.** The output schemas (`llm_schemas.py`) have no amount, price or quantity field; any
  number in the prose must appear in the facts shown (`invented_numbers`), and a question that lays out options is
  rejected. Options and amounts come only from `domain/strategies/*`.
- **The LLM cannot dismiss.** `actionable` is not in the schema; it always comes from the rules, so Ask still
  blocks. The question's context (causes, SOPs, a guardrail re-ask note) stays the rules' text.
- **Fallback to `RuleBasedReasoner`, per call,** on timeout, unreachable provider, refusal, invalid or cut output,
  an SOP id that was not shown, an invented number, another call still running (one call at a time), or the daily
  budget (`LLM_DAILY_BUDGET_USD`, Claude only, kept in the agent database since T-02; fails closed if unreadable). Each fallback is logged with its reason;
  configuration errors (unknown model, bad key, bad parameter, model not pulled) at ERROR, also at startup. After a
  timeout or an unreachable provider, calls pause for `LLM_COOLDOWN_SECONDS`.
- **What the LLM sees:** fixed return-reason codes (no customer free text; reviews are out of scope), amounts in VND
  via `MoneyFormat` (ADR-0007). Shop-, SOP-, case- and admin-supplied text is data in a `<facts>` block with angle
  brackets removed. Small models get fewer SOP excerpts and only the top similar case (`SMALL_MODEL`).
- Server-side refusal `fallbacks` of the Claude API are not used: Anthropic documents them for Opus 5 / Fable 5.1
  with Opus fallback targets, not for Sonnet 5. A refusal falls back to the rules locally.

**Consequences:** the loop behaves exactly as before when the LLM is off, down, slow, over budget or wrong; the
worst an injected product name, SOP or past case can do is change display text, which the owner reads before
deciding. Remaining limits: the number check cannot catch a wrong *qualitative* claim (a small model can misread the
facts), LLM-written lessons flow into case memory and so into later prompts (as quoted data), and output language is
English until it becomes a setting.
