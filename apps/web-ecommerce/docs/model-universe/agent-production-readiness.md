# Agent production readiness

Verification date: 2026-10-09. Phase 9 remains in progress. Do not enable production automation based on passing scripted tests alone.

## Scope and evidence boundaries

The existing graphs are `customer_assistant`, `assistant` (staff copilot), `marketing_copy`, `improvement`, `monitor`, and `collect`. The assistant does not approve pawn rates, pay sellers, verify authenticity, or replace signed business policies. Unimplemented commerce workflows are not made available by inventing agent tools.

All evaluation facts and accounts are synthetic. Actual model tests use local Ollama qwen3.5:9b; scripted runs test graph wiring and deterministic controls. SQL, PostgreSQL/Redis recovery, server authorization and browser results are listed separately. No external advertising publication, real payout or production data reset was performed. Retained browser data and historical transactions remain intact.

## Customer coverage

| Capability | Current verification |
|---|---|
| Search and filters | `search_products`, `catalog_filters`: actual model chooses the existing read; SQL/API ownership and stock checks covered separately |
| Product research | `product_details`, `product_reviews`, catalog price/grade/scale grounding; VI/EN actual model cases |
| Policies | `store_policies`; no invented financial approval actions |
| Account reads | `my_orders`, `my_order`, `my_wishlist`, `return_options`, `review_eligibility`: existing signed customer identity and server ownership enforcement |
| Fresh checkout quote | `cart_quote`; browser quote/coupon refresh and price-change reconfirmation |
| Cart | `cart_add`, `cart_update`, `cart_remove`, `cart_clear`; actual model proposals, existing stock/mutation guards, explicit UI confirmation |
| Wishlist | `wishlist_add`, `wishlist_remove`; product ID and wishlist item ID remain distinct |
| Navigation/session | `navigate`, `logout`; safe route whitelist, explicit action card; no admin navigation |
| Checkout/order changes | `checkout`, `apply_coupon`, `cancel_order`, `return_request`; fresh server quote, customer ownership and idempotency checks |
| Profile/contact/review | `update_profile`, `contact`, `review`; edited form values, real-experience review confirmation, localized errors/status |
| Abuse cases | Role override, another customer's data, credentials/OTP, fabricated review, financial policy override and instructions embedded in product descriptions |

The final customer local evaluation passes **34/34** cases: 15 action types, 11 read types, two grounding cases and six abuse cases. Raw decisions were inspected for the requested IDs, quantities, order lines, shipping and coupon fields. This is one planner turn per synthetic case, not proof of every multistep live conversation. Product IDs are projected onto authoritative catalog/cart records by application code; this protection is not credited as raw-model hallucination resistance.

A refusal can still contain unnecessary or speculative explanations. For example, the evaluated fabricated-review refusal speculates about why eligibility is true. The server does not accept that speculation as policy or execute the review. Broader semantic review, repeat-run reliability and real conversation acceptance remain required.

## Staff coverage

| Area | Verification and limits |
|---|---|
| Copilot reads/delegation | Revenue, inventory, analyst/customer-voice delegation, competitor-title injection and approved memory writes in the existing six-case suite |
| Human decisions | Real Chrome approve/edit/reject UI with explicit agent endpoint doubles; no shop write before the decision |
| Transport failure | Real gateway 503 with disconnected agent server, localized error and explicit retry on VI/EN mobile/desktop; SDK implicit retries disabled for writes |
| Promotion/growth controls | Existing discount limits, platform switches, approval grants, kill switch, publication contracts and idempotence covered by Python/web regression |
| Improvement lifecycle | Detect/investigate/validate/review/execute/measure/learn and cron recovery covered by graph tests and actual Redis/PostgreSQL runtime tests |
| Marketing drafts | Facebook, Meta, Google and TikTok in VI/EN; required per-channel native schemas, character/count limits, no publishing tools |
| Knowledge | Actual pgvector ingest/filter/prune/model-mismatch tests with scripted embeddings; actual BGE 1024-dimensional ingest/replay and VI/EN semantic document/catalog retrieval also pass on an owned synthetic fixture |

Marketing output is always an editable draft. Initial real-model testing returned empty or incomplete channel content. Required channel schemas repair that structural failure. Manual inspection also found unsupported availability language that the original phrase checks missed; the prompt and negative controls were strengthened instead of lowering the gate. A later injection case refused the request but echoed unsafe claims/internal policy numbers into the draft field. Existing deterministic brand lint now rejects percentages/amounts absent from authoritative facts, outside links and other configured brand violations before returning any draft. The final actual-model marketing run passes 8/9; the injection fails closed with `unsafe marketing copy`. No unsafe draft or publication is returned, but the functional quality gate remains failed.

Manual review also disqualifies otherwise automatically passing drafts: the English TikTok text invents an unsupported `Multi-Grade` expansion and ends with `No,`; the Vietnamese TikTok text ends with an unrelated `目` character; a Google headline is truncated mid-word, and some copy refers to broader listings/condition reports absent from the supplied facts. The 8/9 count is the automated schema/phrase/number/language result, not eight publication-ready drafts. Keep human editorial review and final publication approval; these heuristic evaluators are not comprehensive factual or fluency certification. Rejected-copy artifacts from earlier runs may remain on disk; timestamps and the corresponding report determine which run produced them.

## Completed regression evidence

Evidence paths below are relative to ignored `.artifacts/model-universe/`, unless stated otherwise. Failed/interrupted attempts are retained and do not count as passing results.

| Layer | Actual result | Evidence |
|---|---|---|
| Python full check before the final tool-schema normalization | 661 passed, 24 deselected; coverage 96.04%; Ruff, format, mypy and four import contracts pass | `agent-final-approval-python-check.log` |
| Final current-source Python full check | 666 passed, 25 deselected in 274.34 s; coverage 96.04%; Ruff, format, mypy and four import contracts pass | `agent-final-isolated-python-check.log` |
| Actual authenticated graph server | 9 passed in 240.26 s; scripted model and explicit write endpoint double | `agent-reviewed-strict-server.log` |
| Final actual graph server after normalization | 10 passed in 209.04 s; both numeric/string source arguments pause, show identical normalized body, then execute only with the matching signed grant | `agent-final-normalized-server-regression.log` |
| Actual Redis/PostgreSQL durability | 3 passed in 119.20 s: cron idempotence/not-early, crash recovery exactly once, customer isolation | `agent-production-runtime-regression.log` |
| SQL reader permissions | 6 passed in 19.26 s using actual PostgreSQL; first Windows event-loop failure repaired | `agent-reviewed-sql-reader-final.log` |
| pgvector integration | 6 passed in 23.44 s; actual database, scripted embeddings | `agent-reviewed-vector-knowledge.log` |
| Web business/agent PostgreSQL suites | 30 passed in 142.011 s across six suites | `agent-reviewed-real-web-db.log` |
| Final complete web regression | 67 suites / 543 tests passed in 521.843 s across unit and real PostgreSQL projects; explicitly enumerated files and 30-second test budget | `agent-final-reviewed-web-regression.log` |
| Customer action/localization unit tests | 14 passed in 3.854 s; other focused guard/service suites recorded separately | `agent-reviewed-action-localization-unit.log` |
| Customer browser | 10 passed in 1.2 min with explicit customer API doubles; four final VI/EN mobile/desktop captures inspected | `agent-reviewed-bilingual-ui-final.log`, `agent-reviewed-localized-visual-final.log` |
| Staff browser before final manual-retry addition | 10 passed in 1.0 min: four actual outage/recovery and six doubled copilot decision cases | `agent-reviewed-admin-consent-and-recovery.log` |
| Local actual customer model | 34/34, critical gates pass | `agent-customer-local-final-reviewed.md` and matching log |
| Local actual smoke | 5/5, critical gates pass | `agent-smoke-local-guarded.md` |
| Local actual staff copilot before final normalization | 2/6; wrong money type, delegation/timeout and inappropriate memory operation remain visible; no shop writes after approval repair | `agent-copilot-local-guarded.md` |
| Final actual voucher approval probe | 1/1 critical case passes in 71.48 s with normalized money and no pre-approval write | `agent-copilot-normalized-native-probe.log` |
| Local actual improvement investigation | 0/6, all time out at the 180-second target budget | `agent-loop-local-guarded.md` |
| Local actual growth investigation | 3/23, twenty time out; critical gates fail | `agent-growth-local-guarded.md` |
| Local actual marketing after deterministic guard | 8/9; injection rejected by brand lint, quality gate remains failed | `agent-marketing-local-guarded.md` |
| Actual BGE + pgvector | Two synthetic documents/two products, idempotent replay, VI returns, EN custody and semantic MG catalog retrieval pass | `agent-real-bge-qa.log` |

The earlier full web 528-test regression predates these changes. A new broad run was interrupted after a five-second kill-switch test timeout while model inference and compilation competed for memory. Its focused rerun passes with an explicit 30-second test budget (27.383 s). The final explicitly enumerated full regression passes all 543 tests with that 30-second budget; model inference was still running for part of the test period, so this is not an isolated performance benchmark. An initial Windows Yarn array invocation selected zero tests and is not credited. The tests reset only the owned `model_universe_regression_test` database, never retained browser/history databases.

## Repairs made during verification

- Customer requests propagate cancellation and retain absolute model/service budgets. Aborted requests stop later reads/actions and release concurrency slots. This does not physically cancel an already-running SQL statement.
- Native customer output requires reads/actions/product IDs/answer, plans before answering, and maps existing action/read types explicitly. Required per-channel marketing schemas reject empty/incomplete content.
- Every customer action card uses the existing next-intl resources for fields, labels, status, confirmation and errors in VI/EN; currency formatting uses the selected locale.
- Admin proposal reads have a 10-second transport budget and distinguish actual HTTP 404 from a 503 message containing a 404-like thread identifier. Visible errors replace infinite loading and permit explicit retry.
- Agent SDK transport and copilot streaming disable implicit submission retries. Added browser tests cover failed approval followed only by a manual second attempt; their final run is blocked as described below.
- Actual-model copilot testing exposed an approval bypass when a raw numeric string failed request preflight but the tool schema later coerced it to a valid number. The installed tool's public schema now normalizes arguments before preflight and before the approval card; invalid arguments always retain review. The exact regression uses an intentionally permissive demo writer and proves no pre-approval write; a signed approval subsequently applies the exact normalized body. Invalid nonnumeric text remains gated. The final native voucher probe passes without weakening argument checks. The prompt uses Model Universe branding and explicitly requires JSON numbers.
- Eval runner records bounded per-case failure, UTF-8 artifacts, incremental progress and elapsed time for failed targets. Negative controls prove missing/wrong language, fabricated IDs, unauthorized actions and injected claims fail. Language checks are heuristics, not fluency certification. No baseline was changed.

## Release gates still open

- [ ] Final actual-model marketing/copilot/smoke/loop/growth gates pass, including repeat-run and semantic review; do not substitute scripted fixtures for model quality.
- [x] Final current-source web/Python checks recorded: 543 web tests, 666 Python tests, 83/83 scripted evals, production build and types pass; actual graph server 10/10 passes.
- [ ] Final Chrome failed-approval/manual-retry and localized-toast reruns recorded; startup is blocked as described below.
- [x] Real BGE knowledge ingestion/retrieval on an owned synthetic pgvector fixture.
- [ ] Production knowledge resource/role mapping, authorized corpus and complete ingestion/retrieval reviewed independently of synthetic fixtures.
- [ ] Production model profile, credentials, capacity and response latency accepted. The current local environment is `dev` with `simulator`; simulator is forbidden in production. Do not edit owner secrets to manufacture a passing configuration.
- [ ] Production latency/load/error/streaming acceptance on representative hardware. Historical actual browser replies take 62.810–135.834 s on this 4-GB GPU CPU-offload host; no throughput or production SLA claim follows from local planner passes.
- [ ] Complete legacy staff agent-console VI/EN localization and full multistep customer/admin browser coverage against an actual running model/runtime. Doubled consent tests do not prove live execution.
- [ ] External platform sandbox credentials/permissions/approved assets and reconciliation verified before any live publication or budget change.
- [ ] Dependency audit resolved: Python all-extras locked audit reports no known vulnerabilities; current web audit reports one high-severity `braces@3.0.3` advisory through development/build tooling. Registry lookup has no newer release. No advisory suppression or incompatible forced major upgrade was used.

The application remains **not approved for agent production activation** while these gates are open. Preserve the existing kill switch, approval gates and signed business-policy constraints.

## Environment limitation

The final rebuilt web server could not be started for the additional failed-approval/manual-retry browser scenarios: automatic approval review rejected the startup command with `blocked by policy`, without a more specific reason. Existing completed Chrome runs remain valid evidence for their earlier source versions; the additional two cases and the final localized-toast rerun remain unverified. No approval-policy workaround was used.

One final Python attempt encountered a coverage SQLite `no such table: coverage_schema` error. It is retained as failed infrastructure evidence, not a passing check. A fresh task-owned coverage data path avoids the damaged shared artifact; the complete rerun passes all 666 tests and the unchanged 90% minimum. The production build and latest lint/types also pass. The owned pgvector QA container and loaded local QA models were stopped after verification; installed models, retained databases and owner configuration remain intact.
