# Runbook

What to do when something must change now, for the shop owner and whoever runs the servers. Console paths are under
`/admin/agent/` in the web app (sidebar group **TÁC TỬ AI**). The design behind each control: `docs/GROWTH_AGENT.md`
section 4 (guardrails) and section "Autonomy ramp"; the runtime: ADR-0013.

## 1. Stop the agent changing the shop (kill switch)

**Cài đặt tác tử** (`/admin/agent/settings`) → **Công tắc tăng trưởng** off (`growth.enabled=false`), with a reason.

- The web refuses every `shop_change` write with 403 `agent_disabled`: discounts, coupons, posts, new or activated
  ads, budget increases, stock, channels, tasks, checklists. This holds for the copilot's writes too.
- Protective writes still run (pause, end, delete a post, lower a budget, revert), and so do ingestion writes
  (market observations, metrics sync, outcomes). `monitor` opens no growth threads.
- The change is audited (`agent_setting_audit`). Turn it back on the same way.

## 2. Pause every agent ad

**Chiến dịch của tác tử** (`/admin/agent/campaigns`) → **Tạm dừng toàn bộ quảng cáo của tác tử**, or **Tạm dừng** on one ad.
Pausing is protective: it never needs an approval, it is audited, and every admin gets an email. The ads stay paused
until a person approves an activation (a new approval grant). Pair it with the kill switch to stop new ads too.

## 3. Undo an action

Every change has an idempotency key, shown under each entry of **Nhật ký tác tử** (`/admin/agent/audit`) and in the
email sent for a protective write.

- In the copilot (`/admin/agent/copilot`): "Hoàn tác thao tác `<key>`". `revert_action` is protective, so it runs
  without an approval.
- From a shell, with the web's `AGENT_API_TOKEN`:

  ```bash
  KEY='<the idempotency key>'
  curl -sS -X POST "https://<shop>/api/agent/v1/actions/$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=""))' "$KEY")/revert" \
    -H "Authorization: Bearer $AGENT_API_TOKEN" -H "Idempotency-Key: $KEY:revert" -H 'Content-Type: application/json' -d '{}'
  ```

A revert is idempotent (sending it twice reverts once) and releases any budget the action reserved. **Nhật ký tác tử**
then shows `Đã hoàn tác`.

## 4. Autonomy per capability (the ramp)

**Cài đặt tác tử** → autonomy, per capability (`promotion`, `facebook_post`, `ads_meta`, `ads_google`, `ads_tiktok`,
`inventory`, `ops_tasks`): `off` → `shadow` (plans, records, never acts) → `ask` (every change waits in **Hộp duyệt**)
→ `auto_low` (low-tier changes inside the web's low caps run without a person).

- Go-live: every capability in `shadow` for 2 weeks, then `ask`. Nothing leaves `shadow` before the owner has read
  `apps/agent-service/data/knowledge/brand/brand_guide.md` and set `brand.approved`.
- The web allows `auto_low` only after at least 10 measured outcomes in 90 days, at least 60% of them non-negative,
  and no incident in 30 days. **Force** overrides that with a written reason, which is audited.
- Two negative verdicts in a row, or any incident (a guard pause), demote the capability to `ask` automatically.
- A high-tier approval needs the admin's password again (step-up) and the typed VND total; set
  `approvals.high.two_person` to require a second admin.

## 5. Knowledge base

- After changing SOPs, the brand guide or the catalog's text: `cd apps/agent-service && uv run shop-agent ingest`
  (compose: `$CP run --rm agent-runtime shop-agent ingest`). It is idempotent.
- After changing the embedding model: `uv run shop-agent ingest --reindex`. The agent refuses to search an index built
  with another model. On Aegra the Store's index is set in `aegra.json` (`ollama:bge-m3`): change both together.

## 6. Rotate a secret

| Secret | Where | Effect while it differs | Steps |
|---|---|---|---|
| `AGENT_API_TOKEN` (web) = `SHOP_API_TOKEN` (agent) | both | the agent's writes get 401 and are retried later with the same keys | set both, restart the web, then the agent runtime |
| `AGENT_ACTOR_SECRET` | both | the console cannot reach the Agent Server (502) | set both, restart both |
| `AGENT_APPROVAL_SECRET` | web only | a grant signed before the change is refused (403 `approval_required`): a thread acting at that moment records a failed step and reverts its earlier steps; the opportunity can be proposed again | rotate when no thread is acting (**Hoạt động**) |
| `JWT_SECRET` | web | everyone is signed out | set, restart the web |
| `ci_reader` / `shop_agent` database passwords | Postgres, `SHOP_READ_DSN` / `DATABASE_URL` | the agent cannot read the shop or its own database | re-run `infra/sql/ci_reader.sql` / `infra/sql/shop_agent.sql` with the new password (both set it each run), update the DSN, restart the agent runtime |
| Facebook, Meta, Google, TikTok tokens | web only | that platform's calls fail (`platform_error`) | `docs/MARKETING_LIVE_CHECKLIST.md` |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` | agent | traces stop; nothing else changes | set both (or unset both to turn tracing off), restart the agent runtime |

## 7. Go live on an ad platform

One platform at a time, following `docs/MARKETING_LIVE_CHECKLIST.md`: credentials in the web's environment only,
`<PLATFORM>_MODE=live` (the web refuses to start live without them), a first campaign with a small budget, approved by
hand. The platform's capability stays in `ask` until the ramp allows more (section 4).

## 8. The runtime (Aegra)

The production Agent Server is Aegra with Postgres (threads, checkpoints, the Store, crons) and Redis (the run queue),
compose profile `prod-like` (`infra/docker-compose.yml`).

- Health: `GET /health` on the runtime; the web shows "Dịch vụ AI hiện không khả dụng" while it is down.
- A crash or restart loses no work: a run whose server died is re-queued once its lease expires (about 30 s) and
  resumes from its last checkpoint; Act resends its steps with the same idempotency keys, which the web answers as
  replays.
- Crons live in the database. After changing a schedule in `shop_agent/ops.py`, run `shop-agent sync-crons` once
  (compose: `$CP run --rm agent-runtime shop-agent sync-crons`); it changes only what differs and never runs a cron
  early.
- Following one change across systems: its trace id on **Nhật ký tác tử** is the id of the run that made it. Search the
  runtime's logs for that `run_id`, or Langfuse (when tracing is on) for the run's trace.

## 9. Before a release

```bash
python scripts/gate.py --phase 9                    # fast + server
python scripts/gate.py --phase 9 --tier db          # scripts/dev/pg-local.sh start, then export what it prints
python scripts/gate.py --phase 9 --tier runtime     # Aegra with Postgres and Redis
python scripts/gate.py --phase 9 --tier security    # secrets in history, Python and Node advisories
python scripts/gate.py --phase 9 --tier hosted      # needs ANTHROPIC_API_KEY: doctor and every eval suite
```

A baseline for a new profile is written once with `--update-baseline`, in its own commit
(`.claude/skills/run-evals/SKILL.md`).
