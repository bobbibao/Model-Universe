# Catalog discovery and native controls

## Delivered experience

Catalog search, grade discovery, condition/scale/manufacturer filters and budget selection share `/shop`.
The duplicate `/search` and `/kit-finder` pages preserve shared URLs and query parameters through server redirects;
internal entry points open the catalog, and the redundant Model finder navigation item is removed. Historical
analytics paths and assistant allowlists remain compatible. No catalog data or business workflow is removed.

The filter workspace uses one compact search/sort/action row, accessible grade radio pills and an available-stock
checkbox. Secondary criteria open in an optional disclosure. Its open state stays under customer control while
editing; applied advanced URLs reopen it. A count summarizes selected secondary criteria. Apply is explicit and
reset/browser history keep the URL as the source of truth. Vietnamese and English labels match.

Two native range handles and precise numeric fields control minimum and maximum VND prices. Handles retain
keyboard support and announce formatted prices; they cannot cross. Numeric editing supports intermediate text
before bounds are finalized. Zero maximum is an actual zero-price constraint, not a silently cleared filter.
Existing `minPrice`/`maxPrice` API behavior performs the filtering; no endpoint or financial calculation was added.

An unselected upper bound remains unset, including when search is submitted before price metadata arrives;
it cannot accidentally become a zero-budget search. Late metadata supplies the displayed default upper price
without overwriting search/grade drafts. Read failures
show retry instead of an empty catalog, and superseded requests cannot replace the current results.

All storefront and admin single-choice native selects share consistent borders, focus, spacing and colors.
Browsers supporting `appearance: base-select` also receive a rounded top-layer picker, selected checks, readable
options and bounded scrolling. Other browsers retain their native picker with the styled closed control; they
need no JavaScript polyfill. Multi-select controls retain their existing behavior. Forms, required validation,
React event handlers, option values and permissions are unchanged. No dependency was added.

The cart popover and administrator account menu use the same compact visual family. Escape closes each popup
and returns focus to the trigger. Existing cart totals, navigation and session APIs remain authoritative.

## Verification and release boundaries

Final production Docker build, lint and frontend/server type checks pass. Compilation takes 48 seconds on this
local host. The build reports catalog at 6.11 kB / 179 kB first-load JavaScript and each legacy redirect at 145 B;
these are build estimates, not field performance measurements. Existing lint, next-intl cache and dependency
peer warnings remain visible. No runtime dependency, migration, reseed or transaction reset was introduced.

Installed Chrome passes **57/57 browser cases in 3.7 minutes**, with one worker and no retries: seven new catalog
control cases, four search recovery/race cases, eleven Collector Studio cases, ten account cases, ten assistant
cases, ten hero/session cases, four public commerce cases and one admin navigation case. An additional focused
rerun of the strengthened early-search/late-metadata regression passes in 3.5 seconds; it is the same scenario,
not a 58th distinct case. Successful catalog reads, min/max filtering, customer/admin sessions and logout use
actual APIs. Profile/reward writes and assistant transaction scenarios use the existing isolated fixtures.
Financial intake scenarios validate drafts/required steps without recording business writes.

Actual picker options were clicked and keyboard focus/Escape was tested. Both price thumbs were dragged, price
fields were typed one digit at a time, API response prices were checked against the requested bounds, and reset,
back navigation, zero maximum, legacy query redirects, metadata delay and outage recovery were exercised.
VI/EN desktop/mobile captures were reviewed, including the admin dark picker. Dedicated 320/768/1024 px captures
and the 390/1440 px cases report no document overflow; cart popover bounds stay inside each tested viewport.
Other browser engines were not visually tested; unsupported engines retain their native option popup through
the CSS feature-query fallback.

Initial runs exposed disclosure collapse while clearing criteria, price metadata overwriting drafts, premature
numeric clamping and an unintended zero bound during early submission. Those product defects were fixed.
Test assumptions were also corrected: the Vietnamese search icon and removed navigation item share a label,
and manual pointer dragging needs the slider centered above the fixed mobile navigation. Earlier failures remain
in their logs and are not reported as passing. The final source uses an unset upper bound until explicitly chosen.

Ignored evidence under `.artifacts/model-universe/`: `catalog-controls-verified-build.log`,
`catalog-controls-verified-runtime.log`, `catalog-controls-verified-browser.log`, `catalog-controls-early-submit.log`
and `catalog-controls/*.png`. Committed scenarios live in `e2e/catalog-controls.spec.ts`; legacy search and customer
tool tests now exercise the consolidated catalog. Existing business-policy, financial/provider, security and
live-agent quality release gates remain applicable.
