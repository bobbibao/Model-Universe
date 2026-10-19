# Sale events and calculated catalog prices

The owner workspace is `/vi/admin/sales` (also available in English). Public offers appear at `/vi/uu-dai`, at the
top of the homepage, and above an unsearched catalog. No sample campaigns or artificial countdowns are installed.

## Pricing

The specification remains [pricing and vouchers 4.0](../apps/web-ecommerce/docs/business/pricing-voucher-specification.md).
The product editor accepts a market reference **S** (the desired member price), and the number of ordinary issues.
It derives these outputs on both client and server:

- Expected buyback **B = S − tier deduction − 50,000 × ordinary issue count**.
- Public list **R ≈ S / 0.9**, with the existing whole-VND rounding so the standard member code returns S exactly.

The API rejects attempts to replace calculated buyback/list outputs. Creation requires a reference. The migration
derives S and B for existing shop-owned, defect-free products inside the standard tiers from their real published R,
without changing published R or actual cost. Known defects / out-of-table references remain pending appraisal. Legacy
products awaiting appraisal can retain the existing published price during metadata edits, but cannot submit a new
manual price. Price changes
use the loaded `expectedPrice` and are audited in `promotion_audit`. A stale editor must reload before changing price.

Actual acquisition cost **C / importPrice** remains the amount actually paid, separately from the expected buyback
offer. It must not be fabricated from a theoretical quote. Normal intake / purchase workflows keep recording actual C.
Products beyond the standard table (S > 5 million, serious damage or non-positive B) need the existing appraisal
workflow; the editor does not invent another formula or permit arbitrary output overrides. Partner-owned prices
remain in their seller workflow and are excluded from shop promotions.

Every ordinary product card shows the separate conditional member offer. It is not an unconditional direct 10% off.
Direct sale cards show the actual sale amount and discount; list R is labelled explicitly rather than presented as a
fictional old selling price. On sale details, additional member savings are checked in the cart before quoting a number.

## Manual events

Search name/SKU/grade, select products across searches or select all eligible results, set 1–25%, and schedule dates
with the shared calendar. Dates are entered in the browser's timezone, submitted as ISO instants and stored as dates.
The maximum duration is 90 days. Every selected SKU is rechecked inside a transaction; missing cost, unavailable,
partner-owned or unsafe products prevent the complete event from being saved.

Each event is idempotent by request key. Only the highest overlapping direct discount applies; direct events never
multiply each other. The event list supports stopping a campaign and copying a public marketing brief (SKU, actual
discounted prices, dates, conditions and event URL, without internal costs). A stopped campaign cannot be resurrected
by the weekly worker. Confirmed orders retain their existing snapshots.

## Weekly inventory picks

Enable **Bật chọn sale hàng tuần** in the owner workspace, then save. This is off until the owner configures it.
The existing server job checks once a minute, including startup. The first run creates the current Vietnam week;
thereafter a new event is selected from Monday 00:00 Vietnam time until the next Monday. A database lock and unique
week key make concurrent workers/restarts idempotent, including weeks with no qualifying products.

The default rule selects up to 12 products held at least 60 days. Latest recorded receipt time determines age,
falling back to the received date / creation time when no receipt exists. Oldest first, then greater available stock;
currently discounted, held, archived, unpublished, sold-out, partner-owned and unknown-cost stock is skipped.
Targets are 15% for 60+ days, 20% for 90+ days, and 25% for 120+ days, capped by the owner's maximum and reduced only
while selecting the offer to the highest safe integer above 10%. The published percentage is the actual selected
percentage. This selection is audited. The storefront banner uses the maximum **currently active, safe** discount,
never a hard-coded claim about savings.

## Combined member codes and margin

Direct sale publication must retain at least 80% of standard profit **L10 = memberPrice(original R) − actual C**.
One eligible member / money-off voucher may subsequently apply to sale prices. For these managed sales, the combined
check retains 80% of the original L10 on a single-product basket, 78% on a basket of at least two eligible products.
It does not reset the profit baseline to an already-discounted price. Published code caps/terms remain unchanged;
if the combined offer fails, the code is refused with a reason. Existing loyalty tier/reward exclusivity is retained.
Pricing fees remain f = 0, as specified in the current rules.

Sale amounts are shared by public products, cart and final checkout through `ProductDiscountService`. Current cost
and price are rechecked on reads; an event discount becoming unsafe after a cost/price change is withheld. Final
orders recheck locked product rows. Public campaign APIs exclude internal cost / audit settings.

## Deployment and verification

The additive migration creates `sale_campaign` and adds the catalog pricing fields on normal server startup.
After integrating this branch, rebuild web. Google/SMTP configuration is documented separately in
[authentication](AUTHENTICATION.md).

Tests: unit pricing boundaries, tier arithmetic, combined profit floors and Vietnam week boundary;
`tests/db/sale-campaigns.test.ts` exercises real Postgres, idempotence/concurrency, quote parity, overlap/cancellation,
scheduling, live margin checks, receipt age and API formula tampering. `e2e/sale-studio-ui.spec.ts` covers desktop/mobile
in Vietnamese/English with mocked APIs. All database tests require an isolated `*_test` database and recreate data.
