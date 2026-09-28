# ADR-0001: Monorepo, two independent apps

**Decision:** `apps/web` (Next.js) and `apps/agent-service` (Python) live in one repo, deploy
independently, and talk only through `packages/contracts`.

**Why:** the agent needs LangGraph/Python; the web app needs Next.js. Forcing one runtime on
both would make both worse. One repo keeps a contract change and both sides' code in one PR.

**Trade-off:** two toolchains, two CI pipelines. Accepted.
