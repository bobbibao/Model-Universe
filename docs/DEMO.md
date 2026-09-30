# Demo guide

How to set up and run the full loop on one Windows machine (Git Bash): the web shop (`apps/web-ecommerce`), the
CI agent (`apps/agent-service`) and a local LLM (Ollama). It follows the flow that was run end to end on
2026-09-29 (docs/AUTONOMOUS_LOG.md, phase 3).

Detect → Investigate (AI analysis) → Ask (the owner decides in the console) → Improve → Act (through the web Agent
API) → Measure → Learn.

## 1. Prerequisites

- Node.js with Yarn (berry), Python 3.12, PostgreSQL 18 (`C:\Program Files\PostgreSQL\18\bin\psql.exe`), Git Bash.
- Ollama with the model: `ollama pull qwen2.5:3b` (about 2 GB).
- Dependencies: `cd apps/web-ecommerce && yarn install`, then `cd apps/agent-service && pip install -e ".[dev]"`.

In the commands below, `PSQL="/c/Program Files/PostgreSQL/18/bin/psql.exe"`. Git Bash rewrites arguments that start
with `/` into Windows paths; prefix a command with `MSYS_NO_PATHCONV=1` if you pass such an argument.

Generate each secret with letters and digits only (so it needs no URL encoding):

```bash
python -c "import secrets, string; print(''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(40)))"
```

## 2. One-time setup

### Web shop database and seed data

1. `apps/web-ecommerce/.env` (template `.env.example`): `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`,
   `DB_NAME` (e.g. `web_ecommerce_ci_verify`; create it first: `"$PSQL" -U postgres -c "CREATE DATABASE web_ecommerce_ci_verify"`),
   `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `AGENT_SERVICE_URL=http://localhost:8000`, and three shared
   secrets: `AGENT_API_TOKEN`, `AGENT_EVENTS_SECRET`, `AGENT_ACTOR_SECRET` (at least 32 characters).
2. Seed (this **drops and recreates** the shop tables of `DB_NAME`): `cd apps/web-ecommerce && yarn seed-dev`
   (stop it when it says the server is ready).
3. Start the web app once (`yarn dev`): it creates the `analytics` views the agent reads.

### Database roles for the agent (run once, as postgres)

```bash
# Read-only access to the shop's analytics views (web_role = DB_USERNAME of the web app):
"$PSQL" -U postgres -d web_ecommerce_ci_verify -v web_role=postgres -v ci_reader_password=<secret A> -f infra/sql/ci_reader.sql
# The agent's own database (improvements, cases, logs, LLM spend):
"$PSQL" -U postgres -d postgres -v agent_password=<secret B> -f infra/sql/ci_agent.sql
```

### Agent configuration: `apps/agent-service/.env` (git-ignored; never commit it)

| Variable | Value |
|---|---|
| `SHOP_READ_DSN` | `postgresql://ci_reader:<secret A>@localhost:5432/web_ecommerce_ci_verify` |
| `DATABASE_URL` | `postgresql://ci_agent:<secret B>@localhost:5432/ci_agent` |
| `SHOP_API_TOKEN` | the web's `AGENT_API_TOKEN` |
| `WEB_EVENTS_SECRET` | the web's `AGENT_EVENTS_SECRET` |
| `AGENT_ACTOR_SECRET` | the web's `AGENT_ACTOR_SECRET` |
| `REASONER` | `llm` (or `rule_based`: instant, generic texts) |
| `DEMO_MEASURE_AFTER_MINUTES` | `2` (demo only: measure 2 minutes after Act instead of 14 days; refused with `APP_ENV=production`) |
| `SCHEDULER_ENABLED` / `SCHEDULER_INTERVAL_MINUTES` | `true` / `1` (a run every minute, so Measure and Learn happen by themselves) |
| `RECIPIENTS_FILE` | optional: approvers are the web's active admins; the file only adds Telegram/email handles per web user id (docs/NOTIFICATIONS.md) |

Optional: `AGENT_TEST_DATABASE_URL` for the Postgres tests (a throwaway `ci_agent_test` database made with
`ci_agent.sql -v agent_role=ci_agent_test -v agent_db=ci_agent_test`).

## 3. Start

Two terminals:

```bash
cd apps/web-ecommerce && yarn dev                                   # http://localhost:6050
cd apps/agent-service && python -m uvicorn ci_agent.interfaces.http.app:create_app --factory --port 8000
```

The agent log should show, in this order: `DEMO_MEASURE_AFTER_MINUTES=2 ... Demo only`, `Money: 1 unit = 25,000 VND`,
`Agent database ready (schema version 1)`, `LLM reasoner ready: ollama qwen2.5:3b`, `Scheduler started: a run every
60 s`. A warning names anything that is missing (e.g. `analytics views missing`: start the web app first).

## 4. Demo script

1. Sign in at http://localhost:6050 as the admin, open **Đề xuất cải tiến** (`/admin/ci/improvements`). The status line shows
   "Chạy tự động: mỗi 1 phút" and a yellow **DEMO: đo kết quả sau 2 phút** badge.
2. Click **Chạy phát hiện ngay** within a minute of starting the agent (the scheduler's first run starts one interval
   after startup; if it is already going, the button is disabled and the line shows "Đang chạy (tự động)" instead).
   The line shows "Đang chạy (thủ công): đang phát hiện vấn đề...", then "1/2 đề xuất". With qwen2.5:3b on the dev
   laptop this takes about 100 s (4 LLM calls of 10-50 s each). Two proposals appear under **Chờ duyệt**: **Hàng tồn
   lâu** and **Tỷ lệ trả hàng cao**. The figures depend on the seed, which is random on every `yarn seed-dev`
   (for example 17 SKUs / 1.072.290.000 ₫ and 57.1% on 2026-09-29, 25 SKUs / 1.444.290.000 ₫ and 80.0% on
   2026-09-30).
3. Open the dead-stock proposal. **Phân tích**: causes with an **AI** badge (or **quy tắc** when the LLM fell
   back), "SOP-001". Options with VND amounts (discount 20%, outlet, donate) come from the agent's rules, never from
   the LLM. The question text is written by the LLM (or the rules' text when the LLM output was rejected).
4. Approve the 20% discount (you may change **Mức giảm (%)**; the confirmation then names the change, e.g.
   "Mức giảm (%) 20 → 25"). Within a second the status is **Đang đo lường** (measuring): the discount and a task
   were applied through the web Agent API. The storefront now shows the discounted prices; the task is under
   **Công việc từ AI**.
5. Open the high-returns proposal and **reject** it with a note. It closes; **Thư viện tình huống** (case library) shows the lessons
   (written by the LLM, built on your note: e.g. a supplier/size-chart note gave "Switching to a reliable supplier
   is key to reducing high returns.").
6. Optional: stop the agent (Ctrl+C) and start it again. Everything is still there; nothing is sent twice.
7. About 2 minutes after the approval the scheduler measures and learns: the proposal moves to **Đã đóng** with a
   verdict (usually "inconclusive": minutes are too short for real sales to move), and a second case appears.
8. **Hiệu quả cải tiến** shows the before/after deltas of the measured proposal.

## 5. Reset between demos

```bash
# Stop the agent first (the command refuses while it is connected), then:
cd apps/agent-service && python -m ci_agent.interfaces.cli reset-agent-data --confirm-delete-all-agent-data
```

This empties the agent's state (the schema stays). Discounts and tasks the agent applied stay in the shop: revert
them with a web reseed (`yarn seed-dev`, then restart `yarn dev`), and always run the agent reset after a reseed,
because the stored improvements refer to the old data. If you reset the agent without reseeding, the next approval
adds a second discount on SKUs that still carry the first one, and the storefront shows the larger of the two.

## 6. What a failure looks like (all checked on 2026-09-29)

| Situation | What you see |
|---|---|
| Ollama down or model missing | Runs finish fast with **quy tắc** causes; the log names the reason (`not reachable`, or ERROR `run ollama pull ...`) |
| Agent database down | 503 "Cơ sở dữ liệu của dịch vụ AI tạm thời không truy cập được" after about 10 s; recovers by itself |
| Analytics views missing | 503 "Dịch vụ AI chưa đọc được dữ liệu cửa hàng." with the reason (start the web app) |
| Web app down during Act | The proposal shows **Thực hiện lỗi** (act failed) with the step's error; the next run retries once, then gives up and records a lesson |
| Agent down | 503 "Dịch vụ AI hiện không khả dụng" |
| `AGENT_ACTOR_SECRET` differs between web and agent | 502 "Không xác thực được với dịch vụ AI" and a web log line naming the variable |
| A run is already going | 409 "Một lượt chạy khác ... đang diễn ra" |

## 7. Browser tests (opt-in)

`apps/web-ecommerce/e2e` holds Playwright tests of the console. They are not part of the default gates: they need
the running stack (web, agent, Ollama) and the LLM steps take minutes. They use the installed Chrome (no browser
download; `E2E_BROWSER_CHANNEL` picks another channel).

```bash
# Start the web app and the agent (section 3), wait until the agent answers, then:
curl -sf http://127.0.0.1:8000/health
cd apps/web-ecommerce
export E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=...          # an admin of the verify database (never commit these)
export E2E_CUSTOMER_EMAIL=... E2E_CUSTOMER_PASSWORD=...    # optional: a customer, for the access test
yarn e2e console.spec.ts                                    # fast (about 1 min): auth, sidebar, pages, fonts, layout
E2E_LLM=1 yarn e2e loop.spec.ts                             # slow: a detection run through the console
E2E_LLM=1 E2E_ALLOW_WRITES=1 yarn e2e                       # everything, including approve and reject
```

The loop tests need a fresh agent state (section 5) so the seeded signals are new; `E2E_ALLOW_WRITES=1` writes a
discount, a task and a case, so use the verify database only. Report: `e2e/.report/index.html`; failures keep a
screenshot and a trace in `e2e/.results/`.

## 8. Known limits

- The local model is slow on the dev laptop (about 5 tokens/s of generation although the GPU is used) and a 3B model
  writes generic, sometimes wrong statements (seen on 2026-09-30: "The items are from a single category and brand"
  for 25 SKUs across 7 categories, next to the correct per-category counts it was shown). Amounts and options are never affected; Claude (`LLM_PROVIDER=claude`,
  your key) is expected to do much better but was not run here.
- The demo measurement window measures after minutes: verdicts are about mechanics, not real effects.
- Run one agent process: runs and improvements are serialised per process.
- Events to the web timeline are best effort until the outbox (ROADMAP T-07); a lost event is logged as a warning.
- SOP and case search are keyword based (T-06, pgvector not installed); Zalo is unverified (T-05).
- `infra/docker-compose.yml` runs the database and the agent; the web image needs a `.env.<ENVIRONMENT>` file of its
  own and was not built.
