# Roadmap: v2 rebuild and growth agent

The v2 agent (`docs/ARCHITECTURE_V2.md`) is built in place on a dedicated branch, phase by phase, following
`docs/plans/2026-09-30-agent-v2-refactor-and-growth-agent.md`. A phase is done when its gate passes locally and CI is
green on the pushed commit; it is then tagged `v2-phase-N`.

```
python scripts/gate.py --phase <n>            # fast + server tiers, cumulative
python scripts/gate.py --phase <n> --tier db  # needs AGENT_TEST_DATABASE_URL (scripts/dev/pg-local.sh start)
```

| Phase | Deliverable | Status |
|---|---|---|
| P0 | Foundation: v1 frozen in `apps/agent-service/legacy/`, `shop_agent` skeleton, uv + tooling, layering contracts, CI, rules and ADRs | done locally (gate green); CI blocked (see below) |
| P1 | LLM provider layer: profiles, scripted model, budget middleware, `doctor`, eval harness | done locally (gate green) |
| P2 | Domain (VND), adapters, tools, pgvector knowledge base | planned |
| P3 | `improvement` + `monitor` graphs at v1 parity (dead stock, high returns), `simulate` | planned |
| P4 | Web gateway and console on the SDKs, automated demo (Playwright), e2e on Aegra; **v1 deleted** | planned |
| P5 | Growth data: migrations, attribution + consent, market data (manual, CSV, trends, competitor sites), views | planned |
| P6 | Growth hands: promotions, Facebook posts, Meta/Google/TikTok ads (fakes by default), budget ledger, approval grants | planned |
| P7 | Growth brain: detectors, estimators, prioritizer, brand safety, tiers and autonomy ramp, measurement | planned |
| P8 | Copilot (`assistant` deep agent) and chat page | planned |
| P9 | Hardening: Aegra prod-like runtime, durability test, Langfuse, security gates, eval gating | planned |

## CI status

Every GitHub Actions job on the branch fails within seconds without running a step (no runner is assigned, no log), for
every workflow. That is an account or repository setting (Actions disabled, or the account's Actions minutes / billing),
not a workflow error: check Settings > Actions and Billing. Until it is fixed, phases are verified with the same
commands locally (`scripts/gate.py`) and are not tagged `v2-phase-N`.

## Decisions

ADR-0009 (the redesign), ADR-0010 (LLM layer), ADR-0011 (growth autonomy), ADR-0012 (engineering baseline), ADR-0013
(Aegra), ADR-0014 (compliance). The plan's section 10 lists the remaining owner inputs (competitors, brand guide
approval, accounts and keys for going live, one legal review).

## Dropped from v1

- `near_expiry` detection: the shop has no expiry data.
- Agent-side Telegram, Zalo and email channels, the recipient directory and the events webhook (D5): the inbox badge
  and one web email replace them.
- The v1 follow-ups in the old roadmap (persisted ACTING claim, step compensation after a timeout, background runs,
  overlapping discounts, Vietnamese agent text) are addressed by the v2 design: runs, checkpoints and idempotency keys
  from the runtime, the overlap rule in the discount endpoint, and `AGENT_LANGUAGE`.
