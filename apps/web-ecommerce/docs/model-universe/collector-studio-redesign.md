# Collector Studio redesign

Date: 2026-10-10. This iteration replaces the storefront's generic dark commerce presentation with an editorial
collector experience and brings the admin workspace into the same visual family. It builds on the existing
application, components, catalog, service endpoints and permission checks.

## Delivered experience

- Warm paper surfaces, charcoal typography, lavender and lime accents, large editorial headings, rounded photo
  stages, asymmetric compositions and concise service cards. Shared controls and surfaces also update catalog,
  search, comparison, finder, bag, authentication and customer account screens using the storefront layout.
- The homepage features a real available catalog item with its actual name and product link, grade discovery,
  existing featured products, visual service entries and membership access. No fake sales figures, reviews or
  operational promises were introduced.
- Service discovery and all five service pages use a common visual header, clear service navigation, native
  keyboard-accessible policy disclosures and existing actions. Original policy copy remains available. Required
  agreements, ownership disclosures, verification checkboxes and financial confirmations remain in their
  transaction flows; a closed introduction disclosure never replaces consent.
- Buyback and pawn intake separates model identity, condition and actual photographs into three steps. Each step
  validates required fields. All panels stay mounted, back navigation retains values, the final request retains
  the original fields, evidence IDs and idempotency key, and submission still requires three uploaded photographs.
- Catalog shows search, grade and sort immediately; advanced filters remain available in a disclosure that opens
  for applied advanced criteria. Applying and clearing filters use the existing query and product APIs.
- Product cards and galleries use an interactive photograph stage. Galleries retain supplied-angle thumbnails,
  add previous/next controls and a depth/flat switch, and preserve the selected photograph across unrelated
  quantity updates. Pointer transforms use requestAnimationFrame without React renders per move. Touch and
  reduced-motion settings disable pointer tilt; there is no continuous animation loop or WebGL engine.
- About and contact have new visual layouts and complete Vietnamese/English UI copy. Contact retains its API,
  validation rules, signed-in prefill and existing office/contact information.
- Admin retains its complete shared navigation and contextual Copilot, with quieter cream/violet surfaces,
  a plum sidebar and lime active state. Membership tools show one independent form at a time and preserve drafts
  when switching between gift configuration, verified refunds and audited adjustments.
- Store language switching reloads the selected localized route so the existing root translation provider
  refreshes correctly. Switching language does not transfer unsaved forms. Tablet navigation supports Escape and
  focus restoration. The customer assistant receives matching colors and keeps its original actions and consent.

## Images and motion

The repository has photographs, not verified GLB/GLTF models. Perspective, shadow and tilt provide depth to those
photographs; they do not generate unseen sides, rotate the actual object or constitute a real 3D viewer. Accurate
rotatable models require licensed, optimized assets for each product. No mesh, product facts or new image rights
were fabricated. Existing image credit/condition information stays available.

No dependency was added. The already-installed GSAP loads dynamically for a short hero entrance and cleans up on
unmount. Content remains available if motion is disabled or the animation chunk fails to load. Native disclosures
and CSS handle the remaining interactions. Relevant API reference: [GSAP matchMedia](https://gsap.com/docs/v3/GSAP/gsap.matchMedia()/).

## Verification

Verification uses installed Chrome through repository Playwright against the local production Docker stack and
its existing synthetic records. The database was not reset or reseeded. Intake and financial-form UI checks retain
unsent drafts; they do not submit new transactions. Agent consent/action regressions explicitly use response
doubles, so they establish UI behavior rather than live model/provider quality.

Check results and measured performance are recorded below. Evidence is stored in the
ignored `.artifacts/model-universe/collector-studio`, `studio-admin`, build/test logs and performance JSON files.
Automated fixtures select visible gallery controls because Next can retain hidden route trees. The admin header's
exact POST thread-search endpoint is a read query; it is exempted from the financial-write observer, while all
other mutation requests remain checked.

- Production build, lint and frontend/server compilation pass. Independent frontend TypeScript also passes.
  Existing lint/peer-dependency/cache warnings remain; dependency versions were not changed. The final
  production image compiled Next in 28.4 seconds, including the visual spacing and mobile touch-target fixes.
- All 35 unit suites / 365 tests pass in 122.641 seconds.
- 50 distinct Chrome checks pass across the broad run and targeted confirmation: all 32 admin destinations,
  product creation and available detail pages, service discovery/terms, both intake workflows, real product filters,
  supplied photo controls, motion preferences, draft retention, tablet navigation, locale/provider refresh, localized
  contact validation, public home/catalog/product/reservations, search recovery/stale-response isolation, and
  customer/admin assistant consent and editable actions. Vietnamese/English and desktop/mobile are covered.
- The broad confirmation recorded 49 passes and one startup error because it began before the recreated web
  container was ready. A readiness probe was added to the local harness. The following 22-case confirmation passed
  in 1.9 minutes, including that admin navigation case, all new experience checks and ten customer assistant checks.
  Earlier hidden-tree selector and POST read-query classification failures are retained in the logs and corrected;
  they are not counted as passing runs.
- Actual desktop/mobile screenshots were inspected for storefront, service discovery/intake, gallery, About,
  Contact, dashboard and membership tools. This exposed an overlapping About call-to-action heading; its explicit
  line height was corrected. About is also accessible from the existing localized footer navigation.
- The final image, including that visual correction and larger phone menu target, passes all 21 targeted storefront
  and customer-assistant checks in 1.7 minutes. Its updated screenshots were reviewed again. The admin navigation
  startup case already passes in the preceding 22-case confirmation.

## Performance measurements

Sixteen local production samples cover home, services, sell and product detail in both locales at 1440 and 390 px.
The final-source samples use a warm server and a fresh Chrome context per sample, without network throttling. Observers collect paint,
layout shift and resource data for 1.5 seconds after load. The small synthetic catalog, concurrent verification
workload and short observation window limit these results; they are not field Core Web Vitals or release SLAs.

| Measurement | Range | Median |
|---|---:|---:|
| Navigation TTFB | 21–44 ms | 29.5 ms |
| First contentful paint | 148–656 ms | 290 ms |
| Observed largest contentful paint | 184–660 ms | 464 ms |
| Observed cumulative layout shift | 0–0.0353 | 0.00115 |
| Navigation through visible heading | 325–673 ms | 510.5 ms |

Initial observed script response bodies range from 170,250 to 207,308 bytes; optional GSAP is included when the hero
loads it. The build estimates services at 168 kB first-load JS, product detail at 179 kB and admin dashboard at
160 kB. These build estimates and browser response sizes use different definitions and must not be conflated.
The final stylesheet is 34,420 bytes source / 6,572 bytes gzip before HTTP processing. No 3D runtime was added.
The earlier concurrent 16-sample run is retained separately, including its 232–1,220 ms observed LCP range.

The Windows Turbopack measurement started an owned process on port 6052 with seed/drop disabled and restored the
exact original CSS after three HMR probes. Under concurrent verification, API readiness took 32,752 ms, first
homepage navigation 70,015 ms and the warmed homepage 7,016 ms; CSS HMR took 497, 625 and 567 ms. No page errors
occurred in that completed measurement. An earlier readiness attempt timed out and is retained. Development
startup/first-route compilation remains slow in this environment; this release does not claim instant compilation
or solve all pre-existing development performance problems. Production and live edit results should be assessed
separately from that cold development run.

A follow-up with no production build running recorded 117,926 ms to API readiness, 23,558 ms for the first home
navigation and 1,699 ms for the warmed home. CSS HMR took 424, 338 and 260 ms with no page errors. Both runs and
the earlier timeout remain evidence; the slower startup result is not discarded. The exact original stylesheet
was restored and the owned development process was stopped after each completed probe. Fast live editing does
not establish fast cold startup on this Windows host.

## Release boundaries

This presentation release does not approve agent production activation, approve new financial policies, publish
campaigns or replace retained transactions. Existing business/provider release gates remain in
`agent-production-readiness.md` and `release-verification.md`. Local screenshot review is not a full screen-reader
audit or production data-volume/network acceptance. Actual catalog inspection and licensed 3D assets remain
separate prerequisites for genuine 3D product presentation.
