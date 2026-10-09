# Admin workspace redesign

Date: 2026-10-10. Scope: the complete admin presentation layer, navigation and contextual access to the existing
staff Copilot. Business services, API endpoints, permissions, approval contracts and retained transactions are
unchanged.

## Design and implementation

- One persistent workspace layout covers every admin route. Dark navigation, restrained cyan accents, cool
  surfaces, consistent typography and rounded cards replace the mixed legacy layouts.
- `src/css/admin-workspace.css` defines scoped light/dark tokens, common controls, tables, charts, business panels,
  dialogs and responsive layouts. The storefront retains its existing presentation.
- Sidebar, page search and header locations share the same 32 navigation destinations. Page search supports
  Vietnamese without accents and Ctrl/Command K. Keyboard search cannot open over another modal or mobile menu.
- The dashboard keeps its real API metrics and adds direct entries to orders, product creation and AI approvals.
  No example numbers or artificial operational statuses were added.
- List tables retain server sorting, search, pagination and record navigation. Forms retain their field names,
  validation and submissions; shared field errors are linked to their controls for assistive technology.
- Mobile navigation locks background interaction, traps focus and restores it on close. Dialogs support Escape,
  focus containment and focus restoration. Reduced motion disables workspace transitions; analytics charts do
  not animate their data into place.
- The new workspace and Copilot copy are localized in Vietnamese and English. Existing page-specific business
  copy is preserved; older staff/marketing screens still contain Vietnamese copy in English mode.
- Language selection refreshes the root translation provider with a full navigation, preserving the current
  route, query and authenticated session. It does not transfer unsaved form inputs between languages.

## Copilot integration

The launcher is available throughout the admin workspace; the dedicated Copilot page provides the same assistant.
The chat module loads on demand and uses the existing authenticated gateway, conversation history, streaming and
human approval flow. Suggested prompts populate the composer rather than automatically sending requests.

The panel identifies the current page and, for product/order detail pages, its record ID. This context is included
only when the administrator sends a message. Opening the panel does not send a model request. Drafts and the
conversation remain mounted when the panel closes or the administrator navigates between ordinary admin pages.
The dedicated Copilot route retains its own conversation workspace and does not share the launcher's unsent draft.

Memory approvals show their file, original text where supplied, and proposed text. Allowed decisions, editable
fields and submitted approval payloads retain their existing behavior.

## Acceptance checklist

- [x] Apply the workspace to all admin route families, including commerce services and agent screens.
- [x] Preserve existing business APIs and approval/permission boundaries.
- [x] Production build, TypeScript validation and lint completed during implementation.
- [x] Existing unit regression: 35 suites, 365 tests passed.
- [x] Initial real-browser rendering sweep passed on desktop/mobile in both languages.
- [x] Repair issues discovered during browser testing: stale locale messages, mobile focus timing, modal focus
  resetting, overlapping keyboard dialogs, inconsistent dark form surfaces and warning contrast.
- [x] Final browser acceptance and visual review of the final production image.

## Actual verification results

- Production Docker image built and runs successfully at `http://localhost:6050/vi/admin/dashboard`.
- TypeScript validation and build-integrated lint passed. Existing warnings are retained in the build log.
- Unit regression: **35 suites / 365 tests passed** (129.051 seconds).
- Chrome acceptance: **21 checks passed across the final run and a two-check targeted rerun**. The final run
  passed 19 checks; the two management-dialog checks incorrectly counted the approval badge's existing
  read-only `POST /threads/search` poll as a write. After exempting that exact read endpoint, both passed in
  11.3 seconds. No runtime code changed between those browser runs.
- Rendering covers **all 36 admin page types**: 32 navigation destinations, product creation and product/order/
  agent-thread details. The four VI/EN desktop/mobile sweeps include 132 ordinary route visits and 12 detail
  visits, with assertions for HTTP success, headings, missing translations, viewport overflow and uncaught
  JavaScript errors. Desktop is 1440 × 1000; mobile is 390 × 844.
- Interaction checks cover accent-insensitive page search, locale refresh, sidebar persistence, keyboard focus,
  mobile background locking, Copilot draft retention, record context, catalog search/sorting, product/order
  navigation, light/dark themes and reduced motion. Management dialogs cover client validation, error-to-field
  associations, edit and delete cancellation, typing without focus resets and no business write on cancellation.
- Eight consent checks cover approve/edit/reject/failed-approval retry on desktop and mobile with explicit agent
  response doubles. They prove the existing decision payload is preserved, not live model correctness.
- Reviewed the actual screenshots of all 33 ordinary routes, then full-size product/order detail screens,
  representative mobile screens, both themes and management/Copilot dialogs. Fixed extra service-page margins,
  the customer-facing admin reservation empty state and compressed mobile filter controls.

Ignored local evidence is stored in `.artifacts/model-universe/`:

- `admin-redesign-final-browser.log` and `admin-redesign-dialog-browser.log`.
- `admin-redesign-unit.log`, `admin-redesign-acceptance-types.log` and `admin-redesign-release-build.log`.
- `admin-redesign/index.html`: screenshot gallery, plus individual screenshots and four navigation timing files.

The committed regression is `e2e/admin-workspace.spec.ts`, alongside the existing navigation and consent tests.
It uses existing synthetic admin credentials supplied through `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD`.
Consent tests additionally require `E2E_AGENT_CONSENT=dedicated_browser_test`; no credentials are committed.

## Verification environment and limits

Chrome is driven by Playwright against the running local Docker web/agent stack and its existing synthetic demo
database. No reset, reseed, live campaign publication or financial transition is part of this UI acceptance run.
Most UI checks use real endpoints. Copilot approval regression explicitly substitutes agent responses and never
executes a shop write; it verifies the UI's consent payload, not model quality.

The redesign does not approve production activation of the agent. Model grounding, provider availability and the
remaining business/integration release gates continue to be tracked in `agent-production-readiness.md` and
`agent-browser-acceptance-2026-10-10.md`.

## Performance evidence

No new dependency was added. The admin stylesheet is 22,369 bytes uncompressed and 4,738 bytes gzip before HTTP
asset processing. The production build reports first-load JavaScript of 161 kB for the dashboard, 165 kB for the
catalog and 160 kB for orders; the dedicated Copilot route is 312 kB. Opening Copilot loads its additional module
on demand. These are build estimates, not Core Web Vitals or production network benchmarks.

The final Next.js production compilation took 32.0 seconds inside the existing Docker build. The build includes
lint and type validation. Existing lint and peer dependency warnings remain; no dependency version was changed
for this presentation refactor.

Browser navigation measurements from the final production image:

| Language / viewport | Routes | Median | 95th percentile | Maximum |
|---|---:|---:|---:|---:|
| Vietnamese / desktop | 33 | 791 ms | 1,015 ms | 1,114 ms |
| Vietnamese / mobile | 33 | 690 ms | 844 ms | 974 ms |
| English / desktop | 33 | 695 ms | 879 ms | 961 ms |
| English / mobile | 33 | 689 ms | 865 ms | 931 ms |

These measurements include navigation, visible heading/table readiness, assertions and an explicit 250 ms
settling wait. They use a warmed local stack without network throttling, exclude screenshots and are not Core
Web Vitals, cold-load guarantees or development-server benchmarks. Long tables scroll inside their own container
on mobile rather than widening the viewport. Production data volume, deployment-network performance and a full
assistive-technology audit still require environment-specific release verification.
