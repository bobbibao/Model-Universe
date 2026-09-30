# ADR-0011: Growth autonomy: capabilities, risk tiers, layered limits, approval grants, ramp

**Status:** accepted on 2026-09-30. Details: `docs/GROWTH_AGENT.md`.

**Context:** the growth agent decides by itself when and what to do (Facebook posts, ads on Meta, Google and TikTok,
promotions). It spends money and changes prices, so a prompt-injected or buggy agent must not be able to do damage.

**Decision:**

- Every write maps to one **capability** (`promotion`, `facebook_post`, `ads_meta`, `ads_google`, `ads_tiktok`,
  `inventory`, `ops_tasks`) and one **write class**: `shop_change` (needs a decision), `protective` (pause, end,
  delete, decrease, revert of a change, autonomy demotion: always allowed, audited, admins notified) or `ingestion`
  (observations, metrics sync, outcomes, notifications).
- Each action gets a deterministic **risk tier**: `protective`, `low`, `medium`, `high` or `blocked`.
- **Approval grants.** An action's body is exactly the Agent API request body, completed by `validate` before review.
  When an admin approves or edits, the web gateway signs a JWT with a web-only secret binding each action's endpoint,
  idempotency key and body hash (`hashAgentRequest`). The web verifies it on every `shop_change` write after the
  idempotency replay check, so a grant is single-use per action and cannot be replayed under a new key. Without a grant,
  a write passes only if its capability is in `auto_low` and the request is inside the web's low-tier caps.
- **Limits are layered**: domain policies (in `validate` and again in the write tool), the web's hard caps, budget ledger,
  grants and kill switch, then the platforms' own spend caps.
- **Autonomy ramp** per capability: `off` → `shadow` → `ask` → `auto_low`. Promotion to `auto_low` needs 10 measured
  outcomes in 90 days, at least 60% non-negative and no incident in 30 days (or an audited owner override); two
  consecutive negative verdicts or an incident demote to `ask`. Nothing leaves `shadow` until the brand guide is
  approved.
- High-tier approvals need step-up re-authentication and the typed VND total; a second approver is optional.

**Consequences:** the web, not the agent, is the authority on money; every change carries its approval provenance in
`agent_action`; the agent can plan freely without being trusted to act.
