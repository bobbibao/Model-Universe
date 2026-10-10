# Collector account workspace

## Delivered design

The profile route is the primary customer account workspace. An editorial heading, personal identity rail,
collector pass and compact account cards use the existing Collector Studio palette and icons. Mobile navigation
becomes a horizontally scrollable section rail; the page remains readable on narrow phones.

Seven sections share `/user-profile?section=…`: overview, account/security, membership/rewards, orders/returns,
address book, notifications and help/support. Navigation uses normal accessible links with current-page state;
URLs support direct links and browser history. Visited sections remain mounted but hidden so switching sections
does not discard address, claim or gift-delivery drafts. The workspace resets when the authenticated user changes.

The overview displays actual loyalty balances, tier and progress from the existing endpoint. Unavailable data is
shown as unavailable instead of a fabricated zero. Inactive membership policy is disclosed. The collector pass ID
is the existing account ID, not a newly issued membership credential. No discount or financial policy is activated.

Profile editing and password changes reuse the existing APIs and accessible dialogs. Failed profile saves retain
the edited value and show a localized retry message. Sign out is available in the identity rail and account/security
section through the existing verified logout hook. The storefront Account link opens this workspace. Authenticated
visitors to the old membership service route are directed to the unified membership section; public policy discovery
remains available to guests. Existing order/address/notification routes remain compatible.

Storefront account links use locale-specific document navigation. Browser traces reproduced a Vietnamese
client-navigation failure after the initial guest sign-in link had prefetched a session redirect: the profile
requests succeeded, but the visible route remained the homepage. Fresh account navigation avoids retaining that
session-dependent router state on desktop, the mobile menu and the mobile bottom bar.

Membership redemption, historical evidence claims, gift delivery, order cancellation/returns, address version checks
and notification preferences reuse existing components. Membership changes refresh the overview balance; edits to
personal details no longer reset membership drafts merely because the user object changed. Support links open the
existing customer assistant, order tools and contact form. Help text follows existing completed-order point rules
and available return actions rather than promising an unapproved service level.

## Performance and boundaries

The account stylesheet loads with the profile route. Membership, orders, addresses and notifications load their
client components only when first opened. No runtime dependency, database migration or new API was introduced.
The design uses CSS and existing inline icons without continual motion or fabricated collection/order metrics.
Retaining visited sections prioritizes draft preservation over unloading their JavaScript during the same session.

Business activation/provider release gates in `release-verification.md` and `agent-production-readiness.md` remain
applicable. This presentation change is not a production financial/provider activation approval.

## Verification

Acceptance covers both languages and desktop/mobile layouts, direct section URLs, retained drafts and browser
history, modal validation/focus, read-only existing orders, membership and address tools, assistant launch, profile
save failure/retry, membership load failure/retry, isolated redemption idempotency and actual server-cookie logout.
Profile and reward mutations are intercepted in browser fixtures; retained customer data is not changed by those
checks.

Final production Docker build, lint and frontend/server type checks pass. Compilation takes 45 seconds in this
local build; existing lint, next-intl cache-analysis and production dependency peer warnings remain visible.
The generated route report lists profile at 5.5 kB and 172 kB first-load JavaScript (build estimates, not network
or field latency measurements).

Installed-Chrome acceptance passes **35/35 in 1.8 minutes**, with one worker and no retries: ten account cases,
ten customer-assistant cases, ten hero/session cases, four public storefront cases and one admin-navigation case.
Account checks cover VI/EN at 1440/390 px and narrow 320 px guards; actual mobile bottom-bar entry and language
switching preserve the real session. Header/menu entry and actual server-cookie logout pass in both languages.
Assistant transaction scenarios use the suite's isolated API doubles; this run verifies browser integration, not
new live-model quality or financial-provider acceptance.

Desktop/mobile section captures and 320/390/768/1440 px viewport captures were reviewed. The viewport probe
reports no horizontal document overflow at all four widths. Initial acceptance exposed genuine mobile grid
overflow and the Vietnamese account-entry failure; both were fixed. Fixture-only authentication/guard assumptions
were corrected separately. The intermediate 31-pass/two-failure run is retained and is not counted as passing.

Ignored evidence under `.artifacts/model-universe/`: `profile-navigation-build.log`,
`profile-navigation-runtime.log`, `profile-navigation-browser.log`, `profile-navigation-preview.log`,
and `account-hub/*.png`. Tests are committed as `e2e/account-hub.spec.ts` and the updated session suite.
