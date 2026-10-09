# Model Universe experience and visual direction

Companion to the [refactor plan](./refactor-plan.md). This is a design specification, not a claim that mockups or new assets already exist.

## 1. Competitor reference evidence

Research date: 2026-10-08. Public homepage HTML was fetched successfully for all four references; Newtype also returned a browser accessibility snapshot. Observations below concern navigation/content visible in those sources. Checkout, authenticated experiences, visual quality, accessibility and performance were not independently audited. The implementation design phase should capture actual desktop/mobile reference screenshots before making visual comparisons.

| Reference | Observed evidence | Pattern to adapt | Model Universe distinction |
|---|---|---|---|
| [Newtype](https://newtype.us/) | Gundam/model-kit, paint/tools navigation; New Arrivals, Restocks, Coming Soon; grade/scale/series terms; mobile Home/Account/Bag/Search/Menu actions | Strong collector taxonomy, prominent search, stock-oriented browsing, compact mobile navigation | Add actual secondhand condition reports, item provenance, reservations and services |
| [Gundam Planet](https://www.gundamplanet.com/) | Grade categories, preorder navigation, New & Restock Calendar and loyalty content | Release/restock discovery and return-customer utility | Show dependable availability/ETA states and a clear Model Universe points ledger |
| [USA Gundam Store](https://www.usagundamstore.com/) | Gundam grades and scales, preorder collections, tools/paint and arrivals navigation | Product discovery by collector vocabulary; related build supplies | Offer beginner kit guidance and compatibility based on verified attributes |
| [HobbyLink Japan](https://www.hlj.com/) | In-stock/future-release discovery, model categories and Private Warehouse content | Make stock/shipping state explicit; provide useful account logistics views | Use only Model Universe's own deposit/hold rules; do not import HLJ warehouse terms |

These are substantial specialist references selected for relevance, not a verified traffic/revenue ranking. Reuse interaction patterns and public facts with attribution in research notes. Do not copy competitors' code, branding, reviews, policy text or unlicensed photography. Their preorder, warehouse, return and reward policies are not Model Universe business rules.

## 2. Creative concept: a collector's orbital showroom

The experience should feel like a premium mecha showroom: confident product photography, precise technical labeling, generous space and a memorable asymmetric composition. Shopping controls remain familiar and legible.

Proposed direction:

- **Palette:** deep navy/graphite (`#090F1B`, `#142033`), warm white (`#F5F7FA`), restrained cyan (`#5BE7F3`) and signal amber (`#FFC76A`). Verify all actual text/control combinations for contrast; these are starting tokens, not certified pairings.
- **Hierarchy:** dark editorial hero and navigation with lighter neutral product surfaces. Keep product colors accurate; avoid putting every card behind glass, gradients or glow. Use a separate readable dense admin surface from the same tokens.
- **Typography:** one compact display treatment for headlines and a highly readable Vietnamese-capable sans for body/forms. Prefer an existing font if glyph/weight checks pass. Use monospace sparingly for model codes and small specifications.
- **Geometry:** asymmetric 7/5 hero split, a single enlarged product cutout, small frame/corner details and a subtle orbital/blueprint motif. Round interactive controls enough to feel approachable; avoid decorative panels around every paragraph.
- **Photography:** consistent neutral studio backgrounds, generous model headroom, exact SKU/version, varied hero/editorial composition. Used-item evidence is plainly labeled and never visually retouched to hide defects.
- **Copy:** English canonical content with professionally adapted Vietnamese. Short, useful and specific: availability, grade, scale, condition, included parts and next action. No fake scarcity, fictitious global credentials or unverified seller badges.

Distinctive components proposed for implementation:

1. **Model dossier:** a product section combining model identity, grade/scale, assembly status, condition evidence and included parts. The visuals resemble a readable kit specification sheet.
2. **Condition map:** labeled photo thumbnails for box, joints, decals, weapons and disclosed defects; tap opens the relevant real photo. No mandatory 3D viewer.
3. **Reservation preview:** a compact paid/remainder breakdown with discrete deposit milestones and resulting dates. Money inputs and accessible text remain usable without animation.
4. **Collector progress:** a member tier card with restrained progress motion, clear lifetime vs available points and a visible route to rewards/history.
5. **Release strip:** editorial restock/upcoming rail with honest availability and source timestamps; activate preorder actions only after their rules exist.

## 3. Information architecture

Route examples below are proposed targets, not existing implementation claims. `{locale}` is `vi` or `en`. Preserve useful old URLs through explicit redirects after mapping the existing route inventory.

| Audience | Navigation and proposed routes | Purpose |
|---|---|---|
| Visitor | `/{locale}`, `/shop`, `/search`, `/shop/product/{id-or-slug}` under locale | Discover and evaluate exact kits |
| Shopper | Localized cart, checkout, compare, wishlist | Make a confident purchase with accurate totals |
| Collector | Localized new-arrivals, restocks, guides; preorder/releases when ready | Find suitable builds and know when stock changes |
| Customer services | Localized sell-to-us, pawn, reservations and their detail pages | Submit evidence, review quotes and track money/deadlines |
| Account | Localized orders, profile/addresses, reservations, buyback, pawn, membership, rewards, points history, notifications | One understandable home for all customer activity |
| Partner | Localized partner application and partner workspace | Inventory, moderation feedback, orders, payouts and disputes |
| Admin | Localized admin shell retaining existing features plus operations queues | Prioritize due work, review evidence and reconcile transactions |
| Trust/help | Localized shipping, condition guide, returns, deposits, pawn, loyalty, partner policy and contact | Explain actual terms near the relevant purchase decision |

Desktop navigation: primary shop taxonomy, New arrivals, Restocks, Services, Guides; clear search, locale, account and cart. Services groups Sell to us, Pawn and Become a partner. Avoid seven competing CTAs in the hero.

Mobile: persistent search access and at most five primary bottom actions (Home, Shop, Search, Saved, Account). Cart stays identifiable in the header with count. Forms and sticky purchase controls account for the safe area, keyboard and cookie banner; never overlap important content.

## 4. Required screen design

### Home

1. A concise operational announcement if there is a real announcement.
2. Header with useful taxonomy/search.
3. Asymmetric hero featuring a verified model image, one clear shopping CTA and a secondary new-arrivals/restocks CTA. The assistant is accessible but does not replace browsing.
4. Grade shortcuts (EG/HG/RG/MG/PG/SD as applicable) with short learner-friendly hints.
5. Curated new arrivals and real restocks with price, availability, condition and seller identity where relevant.
6. A secondhand discovery section emphasizing actual condition evidence.
7. A compact service trio: reserve, sell to us, pawn; each explains the next step without overwhelming shopping.
8. Beginner build guidance and compatible accessories.
9. Member benefits with precise earning rate and link to complete rules.
10. Footer with verified contacts, policies, language switch and support.

Do not populate every row with an identical generic card grid. Alternate one editorial feature, a compact rail and a dense discovery grid while retaining predictable product controls. Avoid auto-advancing hero carousels.

### Search and product listing

- Fast search by exact name/model code, aliases and series. Debounce suggestions and cancel stale requests; useful server results remain available when suggestions fail.
- Filters: grade, scale, series, manufacturer, condition, assembly status, price, stock, seller and relevant accessories. Selected chips and result counts reflect real backend predicates.
- Persistent URL state, clear all, sorting and accessible pagination. Use a mobile filter sheet; preserve scroll on returning from a product.
- Card: image, exact product name, grade/scale, condition, actual price, truthful availability, seller badge where verified and save action. Do not show misleading discounts without a real reference price.
- Preowned cards label unique inventory; reserved items do not retain an active purchase CTA. Multi-unit SKUs expose remaining available quantity correctly.
- Empty results suggest clearing a specific filter or related search; no fabricated recommended stock.

### Product detail

- Desktop gallery + sticky purchase summary; mobile gallery first with unobstructed sticky purchase action.
- Image zoom, dimensions reserved before loading, thumbnails lazily loaded, real photo captions and accessible alt text.
- Identity/grade/scale/version, availability, condition/assembly, price, seller, shipping estimate only when supported.
- Purchase, reserve and save are clearly distinct. A deposit preview explains minimum payment, remaining amount and hold days before submission.
- Product dossier, included/missing parts, defects, condition evidence, specifications, policy summary, authenticated-purchase reviews and compatible accessories.
- Compare up to three kits using available structured facts; unknown attributes show unknown rather than invented values.
- The assistant may explain facts and compare inventory. It must not guarantee stock, quote a final buyback/pawn value, authorize a payout or invent a missing specification.

### Checkout and post-purchase

- Retain login-required checkout initially; let guests prepare a cart and resume safely after login.
- Use an address section, actual delivery methods and clear payment choices with one persistent order summary.
- Item/discount/shipping/service fee/paid deposit/remainder are separate rows. Disable duplicate submission; a timeout offers reconciliation rather than a second blind payment.
- Explain unsupported shipping region and item availability changes early. Do not promise free international shipping from bilingual UI.
- Success page retrieves persisted order state. Tracking timeline distinguishes requested, confirmed, shipped, delivered, collected and completed where appropriate.
- Return/support flow collects reasons and relevant photo/video evidence, then displays a real case status.

### Services and workspaces

- Reservation detail: money summary, dates, countdown, top-up preview, request delivery/pickup, payment history and extension history. Color reinforces text; expiry is not communicated only by red.
- Buyback: short stepped intake, mobile uploads, provisional vs final quote, accept/reject action, return shipping and payout timeline.
- Pawn: clear private terms/contract, asset custody, disbursed principal, daily rate, accrued interest/cap, due date, redemption quote and extension request. Avoid gamified borrowing prompts.
- Loyalty: distinguish lifetime and available points, tier benefits, reward cost/minimum spend/expiry, points history, historical claim status and remaining point debt when applicable.
- Partner: focused inventory and fulfillment tables, moderation feedback, guarantee and proceeds breakdown, outstanding disputes and settlement status.
- Admin: queue-oriented overview for deposits to verify, holds near expiry, incoming inspections, due contracts, reward claims, unapproved listings and blocked settlements. Reuse existing data tables/forms; record reasons where actions affect money or ownership.

Every screen needs intentional loading, empty, error, success, unauthorized, offline/network-failure and relevant pending-review states. Skeletons match the content and never impose a minimum artificial wait.

## 5. Motion specification

| Interaction | Implementation proposal | Constraints |
|---|---|---|
| Hero orbital emblem/grade selector accent | Lazy GSAP + MorphSVG island with original SVG paths | One short morph after primary content is visible; static SVG fallback; no dependency in every product card |
| Form/order success or empty-state illustration | One small licensed Lottie/dotLottie asset loaded on use | Play once, stop when hidden, static fallback, never block confirmation |
| Buttons, tabs, drawers, cards | CSS transform/opacity transitions | Approximately 120–220 ms; no layout shift; keyboard equivalent |
| Gallery and deposit preview | Native UI plus modest CSS movement | Text, totals and dates update immediately; do not animate money ambiguously |

Verify actual library versions/export paths and distribution terms during implementation. Do not assume a LottieFiles asset is free merely because it is downloadable. The plan does not authorize copying competitors' artwork.

Respect `prefers-reduced-motion`; disable nonessential morphs/parallax and provide static states. No scroll hijacking, full-page WebGL, particle fields, autoplay video, custom cursor or looping animation wall. Cap each animation asset at a proposed 100 KiB compressed and inspect the runtime cost separately. If a treatment fails the performance budget, simplify the treatment instead of hiding the cost in a global bundle.

## 6. Complete media replacement

Inventory and replace all active apparel/template assets: hero, banners, product thumbnails/galleries, category art, about/contact editorial images, avatars used in demo content, logo/favicon/social previews, email images, empty/error illustrations and generated campaign examples. Keep neutral technical icons only if they fit the new visual system. Inspect public files, CSS backgrounds, database URLs, email templates, agent fixtures and screenshots used in documentation.

Proposed media manifest fields:

```text
assetId, localPath, productSku, role, sourceUrl, rightsBasis,
attribution, capturedAt, checksum, width, height,
localeAltText, actualItemEvidence, optimizationVariants
```

- Use own/supplier-authorized photos or assets with an appropriate license. Record exact model/version mapping; an HG photo cannot stand in for its RG edition.
- Product evidence must represent the item. AI-created visuals may serve original abstract backgrounds or clearly editorial scenes, never proof of a secondhand item's condition or an exact kit's included components.
- Store derivative filenames in English kebab-case. Strip private metadata where appropriate, produce responsive WebP/AVIF sizes and retain appropriate original evidence privately.
- Self-host approved assets or use a configured image CDN. Remove ASOS allowlists/hotlinks after consumers are migrated. Do not hotlink competitor images in production or depend on them for dev startup.
- Use consistent aspect ratios and a neutral fallback graphic for actual load errors. Do not use a generic placeholder as the final image for every seed product.
- Verify both HTTP/file existence and visual correctness; manifest presence alone does not prove that the correct Gundam appears.
- Define source/archive/derivative retention and cleanup. Transaction evidence must not be deleted as an orphaned draft upload.

## 7. Design acceptance

- Produce reviewable home, catalog, product, cart/checkout and service/account examples with real curated seed data before extending the system to every admin screen.
- Review at 360/390, 768, 1440 and 1920 px, in both languages. Vietnamese diacritics must render cleanly; longer translated labels may wrap naturally.
- Verify keyboard navigation, visible focus, appropriate dialog behavior, screen-reader labels/live statuses, minimum practical touch targets and WCAG 2.2 AA contrast.
- Check zoom, slow network, missing images, empty searches, price changes, out-of-stock transitions, private evidence permissions and reduced motion.
- Measure the [performance targets](./refactor-plan.md#7-performance-and-development-experience). A visual treatment is accepted only if the underlying tasks remain quick and understandable.
- Save before/after screenshots and short flow recordings during implementation. A polished homepage alone is not evidence that the whole site was redesigned.
