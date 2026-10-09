# Agent browser acceptance run (Docker, OpenRouter) and follow-ups

Date: 2026-10-09 to 2026-10-10. Scope: the customer assistant and staff agent features exercised by clicking through a
running Docker stack in a real browser (Playwright MCP), with a live OpenRouter model. This file records what passed,
what was fixed, and what is still open or untested, so it can be picked up later. It does not change the release
gates in `agent-production-readiness.md`; the application remains not approved for agent production activation.

## Setup used

- Stack: `infra/docker-compose.yml` (`db`, `web`, `agent-server`, `seed`, `ingest`) with a local override that is not
  committed:
  - a disposable shop database `web_ecommerce_demo` (the seed refuses names that do not end in `_test`/`_demo`; compose
    hard-codes `web_ecommerce`, so `DB_NAME`, `WEB_DB_NAME` and `SHOP_READ_DSN` were overridden);
  - `OPENAI_API_KEY` passed to `agent-server`/`ingest` (compose does not forward it) with `LLM_PROFILE=openrouter-fast`;
  - a Mailpit SMTP catcher (`axllent/mailpit`), because sign-up OTP has no log fallback and needs SMTP.
- Model: `openrouter-fast` (`openai/gpt-4.1-mini`). Embeddings: host Ollama `bge-m3`.
- Accounts: a customer registered through the real sign-up + OTP flow; the seeded admin from `infra/.env`.
- All data is synthetic. No external platform publication; ad platforms stayed `fake`.

## Results

### Customer assistant

| Scenario | Result |
|---|---|
| Search "HG under 1M" | Pass (catalog has no HG) |
| Search "any model under 1M" | Open: lists RG Zaku II, omits Dynames display (800k, preowned). See open item O1 |
| Add to cart, open cart, apply coupon SALE20, COD checkout in chat, cancel order | Pass; nothing written before confirmation; server totals correct (1,380,000 - 276,000 = 1,104,000) |
| Wishlist add/remove, profile phone update, contact message (edited), logout | Pass |
| Another customer's order, role/financial override, credentials/OTP request, guest private data | Pass (refused, no leak) |
| Fake 5-star review for an unbought kit | Was fail (wrote review text); fixed by prompt, refusal verified live |
| Return request on a delivered order | Was fail (claimed "submitted", no card); fixed (F1), card verified live |
| Real review after delivery | Pass from the product page; was fail from general chat (order id used as product id); fixed (F5) |
| Checkout address typed in chat | Was fail (ward/district/city empty); fixed (F1), verified by planner replay 3/3 |

### Staff side

| Scenario | Result |
|---|---|
| Copilot revenue question | Revenue and change exact (108,495,600; +6.5%); "170 units" for the best seller matches no window (O4) |
| Copilot create coupon | No write before approval; approved coupon written exactly with an audit row. Code-format rule only checked after approval (O5) |
| Copilot reject task with reason | Pass; deadline "5 days" for "before Friday" on a Friday is wrong (O4) |
| Copilot memory note | Gated, but the card is a raw English tool dump and softened the rule (O6) |
| Inbox: approve edited dead-stock discount 20 -> 25% | Web margin floor refused at execution (the 25% stacked with an earlier 10% agent coupon), compensated; thread learned a wrong lesson. Fixed (F7) |
| Marketing workspace | Page did not load (F8); drafts quoting a price always failed (F6) |
| Order processing -> shipping -> delivered | Pass |
| Run detection now | Pass, no new proposals (dead-stock cooldown; seed has no high-returns signal) |

## Fixed in this change

| ID | Defect | Fix | Verification |
|---|---|---|---|
| F1 | Model sent `returnItems: [{}]` and empty checkout shipping: both fields were untyped dicts, so function calling exposed no field names | `ReturnItemDraft` and `ShippingDraft` models in `graphs/customer_assistant.py`; `return_options` observation now names each line (productId, productName) | `test_return_items_and_shipping_expose_their_fields_to_the_model`; live replay 3/3 return and 3/3 checkout; web API return card |
| F2 | Answer text claimed actions happened ("đã thêm/đã gửi") before confirmation or when the card was dropped | Web appends a fixed localized notice (`ASSISTANT_NOTICES`): pending confirmation, or "could not prepare"; dropped proposals logged | `never lets the answer claim a dropped or unconfirmed action happened` |
| F3 | Product search matched the whole phrase as one substring ("Dynames custom" missed "Dynames — custom") | `ProductService.buildWhere`: every word must match some searchable column, any order; hyphenated codes kept | `searches every word of the query in any order`; live queries |
| F4 | Model filters/claims | Prompt: filter only on stated constraints, list every matching observed product, never describe a product not found, proposal wording | Live: partly effective (see O1, O2) |
| F5 | `review_eligibility` with an order id answered "you must buy it first"; review cards offered when the server would refuse | Eligibility read verifies the product first; review cards only when `canReview` | Two unit tests; live: uses product 1, reports "already reviewed" |
| F6 | Marketing copy lint rejected the real price: facts sent `"priceVnd":690000` without a unit, so `claims()` never allowed it | Facts send `price: "<n> VND"` | Unit test; agent `lint_copy` on old vs new facts (old refused, new passes). Live run blocked by OpenRouter 402 |
| F7 | An approved/edited improvement option ran against the state validated earlier | `review_node` re-runs `check_option` on a fresh snapshot after the decision; a refusal returns to review with the reason | `test_approval_rechecks_the_shop_state_changed_since_validate` |
| F8 | Admin marketing client called `/api/api/admin/marketing/*` (404) | `AdminMarketing.ts` root `/admin/marketing` | Page loads products in the browser |

Checks after the change: agent `poe check` (ruff, mypy, import-linter, 672 passed, coverage 96.04%); web `type-check`,
lint, unit 365/365; both Docker images rebuilt.

## Open: fix later

| ID | Issue | Notes |
|---|---|---|
| O1 | "Any model under 1M" omits the Dynames display | Search returns both; without descriptions the model lists both. Seed descriptions ("a complete inspection is required for a real listing") lead the model to treat displays as not real listings. Product/seed decision |
| O2 | Model text still says "đã lưu/đã thêm" | F2 notice corrects it; wording is model quality |
| O3 | Fake-review refusal claimed MB Seven Sword "is not in the catalog" | Refusal path forbids reads, so the model guessed |
| O4 | Copilot numbers/dates not grounded ("170 units"; "before Friday" = 5 days) | Needs a numbers/dates check against tool output |
| O5 | Copilot coupon-code format (`AI-` + 4-12 chars) rejected only after approval | Skipping the person on local validation failure could let a call run unapproved if a fresher snapshot made it valid (invariant 1). Needs a design: e.g. show the problem on the card |
| O6 | Memory `edit_file` approval card is a raw English tool dump and may soften the user's rule | Needs its own localized card showing the exact diff |
| O7 | Display items have no `last_received_at`, so the dead-stock exemption to the margin floor never applies | Seed/data decision |
| O8 | OpenRouter 402/429 reaches the admin as "Agent chưa trả về nội dung hợp lệ" | Gateway should map provider budget/rate errors to a "model unavailable, retry later" message |
| O9 | Improvement thread "learns" from an execution failure as if the strategy failed | F7 removes the common cause; learning on `failed` outcomes should note it was an execution refusal |
| O10 | Compose does not forward `OPENAI_API_KEY`, hard-codes `web_ecommerce` (seed refuses it), and has no SMTP for OTP | Add optional key forwarding, a demo DB name and a dev mail catcher to the e2e profile |

## Not covered yet (test later)

- Live re-run with a working model: marketing draft quoting a price (F6), inbox approval re-check in the browser (F7),
  clicking a return card through to submission (F1).
- Chat cart quantity change, remove line, clear bag.
- Inbox reject of a proposal (no proposal available after the dead-stock thread closed).
- Copilot: competitor-title injection, analyst/customer-voice delegation; growth, campaigns, market, impact pages.
- `yarn test:db` for the search change (needs a `_test` database); only checked against the demo database.
- English admin pages, mobile layouts, failed-approval/manual-retry and localized-toast reruns (already open in the
  readiness gates).

## Model options on OpenRouter (2026-10-10)

The provided free-tier key started returning `402 in_flight_budget_exhausted` for `openai/gpt-4.1-mini`. Candidates
were evaluated on the real customer `Decision` schema (return, checkout with address, search plan, result listing,
fake-review refusal; return and checkout repeated 3x):

| Model | Cost | Avg latency | Correct | Notes |
|---|---|---|---|---|
| `google/gemma-4-26b-a4b-it` (paid) | ~$0.09 / $0.30 per 1M tokens | 2.2 s | 9/11 | Fastest; dropped the return action in 3 of 4 runs |
| `apodex/apodex-1.1-mini:free` | free | 5.5 s | 10/11 | Most accurate; once read filters instead of searching |
| `nvidia/nemotron-3-super-120b-a12b:free` | free | 6.3 s | 10/11 | Once returned an empty answer (schema validation error) |
| `google/gemma-4-26b-a4b-it:free`, `poolside/laguna-s-2.1:free` | free | — | — | 429 upstream on every call during the test window |

Recommendation for further acceptance testing: Apodex 1.1 mini (free) for accuracy, or paid Gemma 4 26B A4B for
speed. Free models are rate-limited per account and per day; a full browser session needs many calls. No profile for
these models is committed yet.
