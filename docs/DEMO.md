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
2. Click **Chạy phát hiện ngay**. The line shows "Đang chạy (thủ công): đang phát hiện vấn đề...", then "1/2 đề
   xuất", "2/2 đề xuất". With qwen2.5:3b on the dev laptop this takes about 90 s (4 LLM calls of 15-40 s each). Two
   proposals appear under **Chờ duyệt**: **Hàng tồn lâu** (17 SKUs, about 1.072.290.000 ₫ at cost) and **Tỷ lệ trả
   hàng cao** (3 SKUs, worst 57.1%).
3. Open the dead-stock proposal. **Phân tích**: causes with an **AI** badge (or **quy tắc** when the LLM fell
   back), "SOP-001". Options with VND amounts (discount 20%, outlet, donate) come from the agent's rules, never from
   the LLM. The question text is written by the LLM (or the rules' text when the LLM output was rejected).
4. Approve the 20% discount. Within a second the status is **Đang đo lường** (measuring): the discount and a task
   were applied through the web Agent API. The storefront now shows the discounted prices; the task is under
   **Công việc từ AI**.
5. Open the high-returns proposal and **reject** it with a note. It closes; **Thư viện tình huống** (case library) shows the lessons
   (written by the LLM).
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
because the stored improvements refer to the old data.

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

## 7. Known limits

- The local model is slow on the dev laptop (about 5 tokens/s of generation although the GPU is used) and a 3B model
  writes generic, sometimes wrong statements. Amounts and options are never affected; Claude (`LLM_PROVIDER=claude`,
  your key) is expected to do much better but was not run here.
- The demo measurement window measures after minutes: verdicts are about mechanics, not real effects.
- Run one agent process: runs and improvements are serialised per process.
- Events to the web timeline are best effort until the outbox (ROADMAP T-07); a lost event is logged as a warning.
- SOP and case search are keyword based (T-06, pgvector not installed); Zalo is unverified (T-05).
- `infra/docker-compose.yml` runs the database and the agent; the web image needs a `.env.<ENVIRONMENT>` file of its
  own and was not built.
