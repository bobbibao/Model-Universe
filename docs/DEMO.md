# Demo guide

The closed loop on v2: the web shop (`apps/web-ecommerce`), the Agent Server running the LangGraph graphs
(`apps/agent-service`), and a model. The same flow is automated as a browser test,
`apps/web-ecommerce/e2e/agent-demo.spec.ts` (tag `@demo`), run locally against either setup below (section 3).

Detect → Investigate → Improve (validated options with computed VND estimates) → Ask (the admin decides in the
inbox) → Act (through the web Agent API, with an approval grant) → Measure → Learn.

## 1. Set up

### A. Compose (Docker)

```bash
cp infra/.env.example infra/.env        # replace every <value>; letters and digits only
# For the scripted demo add: LLM_PROFILE=scripted and DEMO_MEASURE_AFTER_MINUTES=1
CE="docker compose -f infra/docker-compose.yml --env-file infra/.env --profile e2e"
$CE run --rm seed                       # drops and reseeds the shop tables
$CE up -d --wait db web agent-server
$CE run --rm ingest                     # indexes SOPs, brand guide and catalog; creates the crons
```

The shop is on http://localhost:6050 (admin: `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `infra/.env`), the Agent Server on
http://localhost:2024 (LangGraph Studio: the URL `langgraph dev` prints in `$CE logs agent-server`).

### B. Without Docker (Windows Git Bash, Linux, macOS)

1. PostgreSQL with pgvector. Create the roles once, as a superuser:
   `psql -d <web db> -v web_role=<web DB user> -v ci_reader_password=<secret A> -f infra/sql/ci_reader.sql`,
   `psql -d postgres -v agent_password=<secret B> -f infra/sql/shop_agent.sql`, then
   `psql -d shop_agent -c 'CREATE EXTENSION IF NOT EXISTS vector'`.
2. Web: `apps/web-ecommerce/.env` from `.env.example` (`DB_*`, `JWT_SECRET`, `ADMIN_*`, `AGENT_SERVER_URL`,
   `AGENT_API_TOKEN`, `AGENT_ACTOR_SECRET`, `AGENT_APPROVAL_SECRET`); `yarn install`, `yarn seed-ci` (drops and reseeds
   the shop tables, creates the views), `yarn dev`.
3. Agent: `apps/agent-service/.env` from `.env.example` (`DATABASE_URL`, `SHOP_READ_DSN`, `SHOP_API_TOKEN` = the web's
   `AGENT_API_TOKEN`, `AGENT_ACTOR_SECRET` = the web's, `LLM_PROFILE`, `DEMO_MEASURE_AFTER_MINUTES=1`);
   `uv sync --frozen --all-extras`, `uv run shop-agent ingest`, `uv run poe dev` (serves on 2024 and creates the crons).

### The model

- `LLM_PROFILE=scripted`: deterministic texts, no model needed. The automated demo uses it.
- `LLM_PROFILE=local`: Ollama on your machine (`docs/LOCAL_LLM.md`; `shop-agent doctor --suggest-profile` picks the
  profile for your hardware).
- `LLM_PROFILE=anthropic`: hosted, with `ANTHROPIC_API_KEY` in your environment.

Whatever the model, every amount, quantity and option is computed by the agent's code; the model chooses among
options and writes the analysis.

## 2. Demo script

1. Sign in as the admin and open **Hộp duyệt** (`/admin/agent/inbox`, sidebar group **TÁC TỬ AI**).
2. Click **Chạy phát hiện ngay**. The `monitor` graph detects and opens one thread per signal; the threads investigate
   in the background and the inbox refreshes every 10 s. Two proposals appear under **Chờ duyệt**: **Hàng tồn lâu: N
   mã** and **Tỷ lệ đổi trả cao: N mã** (N depends on the seed). The **Tác tử AI** badge in the header counts them (it polls every 60 s).
3. Open the dead-stock proposal: **Phân tích** (causes, "SOP-001" as the referenced procedure), **Các phương án** with
   estimates in VND ("Thu hồi ước tính ... ₫"), and the decision panel **Cần bạn quyết định**.
4. Change **Mức giảm (%)** from 20 to 25, click **Duyệt phương án đã chọn** and confirm: the dialog names the change
   ("Mức giảm (%) 20 → 25"). The web signs an approval grant over the exact requests that will run; the thread acts
   and moves to **Đang đo lường**. **Thao tác đã thực hiện** lists "Giảm 25% trong ... [thành công]" and a task. The
   storefront shows the sale price (`/search?q=<one of the SKUs>`: "-25%"), and **Công việc từ tác tử**
   (`/admin/agent/tasks`) lists "Ưu tiên hiển thị các mã đang giảm giá".
5. Open the high-returns proposal, write a note (e.g. "Nhà cung cấp in sai bảng size") and click **Từ chối**. The thread
   learns from the note and closes: **Đã đóng**, result **Bị từ chối**.
6. After `DEMO_MEASURE_AFTER_MINUTES`, the next `monitor` tick (the dev cron runs every minute, or click **Chạy phát
   hiện ngay**) measures and learns: the dead-stock thread closes with a verdict, **Hiệu quả cải tiến**
   (`/admin/agent/impact`) lists it, and its page shows **Kết quả đo lường** and **Bài học**.
7. Optional: open a thread in LangGraph Studio to see every checkpoint; **Tri thức** (`/admin/agent/knowledge`) lists
   the cases the agent learned.

## 3. The automated demo

```bash
# With the stack running (section 1) and a throwaway database (the test writes a discount, a task and cases):
cd apps/web-ecommerce
export E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... E2E_ALLOW_WRITES=1
yarn e2e --grep @demo            # about 2 minutes, including the one-minute measurement wait
```

It uses the installed Chrome (`E2E_BROWSER_CHANNEL` picks another channel; `E2E_CHROMIUM_PATH` launches a given
Chromium binary). It needs a fresh stack: reseed the shop and restart the Agent Server first (section 4). Report:
`e2e/.report/index.html`; failures keep a screenshot and a trace in `e2e/.results/`.

## 4. Reset between demos

Reseed the shop (`$CE run --rm seed`, or `yarn seed-ci`), then give the Agent Server a fresh state: the dev server
keeps threads, the Store and crons under `.langgraph_api/` in its working directory (compose: recreate the container,
`$CE up -d --force-recreate --wait agent-server`; without Docker: stop `poe dev`, delete
`apps/agent-service/.langgraph_api/`, start it again). Then run the ingest again (`$CE run --rm ingest`, or
`uv run shop-agent ingest && uv run shop-agent sync-crons`): it also recreates the crons.

## 5. What a failure looks like

| Situation | What you see |
|---|---|
| Agent Server down | a toast "Dịch vụ AI hiện không khả dụng, vui lòng thử lại sau." (the gateway answers 503) |
| `AGENT_ACTOR_SECRET` differs between web and agent | a toast "Không xác thực được với dịch vụ AI." (502) and a web log line |
| Analytics views missing (web never started on this database) | `shop-agent ingest` and `monitor` runs fail with "analytics views missing: the web app has not created them yet" |
| Web down while the thread acts | the step is retried; after the last attempt the earlier steps are reverted and the thread records the failure |

## 6. Known limits

- The Agent Server is `langgraph dev` (in-memory runtime, persistence best effort) in development and in the e2e
  stack. The production runtime is Aegra (compose profile `prod-like`, ADR-0013); `@demo` also passes against it.
- A one-minute measurement window measures mechanics, not real effects.
