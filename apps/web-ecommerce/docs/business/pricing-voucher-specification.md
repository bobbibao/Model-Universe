# Buyback price, member price and smart vouchers (4.0)

Canonical English interpretation of the owner's pricing and voucher specification 4.0, received 2026-10-16
([original](source/vi/pricing-voucher-specification.md)). Rule version `voucher-4.0` (`src/shared/pricing.ts`).

## Four separate values

- **C / A – actual cost**: what the shop paid to import or buy back the model plus costs to resell it. Today:
  `product.importPrice` (a buyback intake sets it to the paid amount).
- **S – target member selling price**: what a member pays after the standard 10% voucher.
- **R – list price**: the public price vouchers are computed from (`product.price`, or the running sale price).
- **L10 – standard profit**: `S × (1 − f) − C`, with `f` the variable fee rate (0 until configured).

`R ≈ S / 0.9`, `member price = R − ROUND(R × 10%)` (half-up, whole VND). R may be shown as the list price only when it
is a real public price; it is never shown as a struck-through "old price". Buyback pricing uses S, never R.

## Profit guard

For a profit-guarded voucher on the eligible lines (shop-owned, inside the SKU lists):

- Keep at least 80% of L10 on a single-product order, 78% on a basket of two or more eligible products.
- `minimum payment = (C + Lmin) / (1 − f)`; `maximum safe discount = R − minimum payment`.
- Discount = `MIN(ROUND(eligible R × percent), published cap)`. The voucher applies only if the resulting profit is at
  least Lmin (and the configured minimum profit). Missing cost or a non-positive L10 blocks it automatically.
- If a voucher fails, the customer sees why; the code's value or terms are never changed silently.

## Voucher terms (admin)

Percentage 8–25% for guarded vouchers, optional cap, minimum order, eligible/excluded SKUs, cart type (any, single,
basket), campaign budget (used amount grows per order and is restored on cancellation), usage limit, validity, public
wallet visibility. Every create/update is audited (`promotion_audit`). Issued member codes cannot be edited.

**Monthly member voucher**: an admin creates a `member_template` (e.g. 10%, orders from 500,000 VND). Each customer
claims one code per Vietnam month (`M<YYMM>-<userId>`, single use, expires at month end), copied from the template.

One money-off code per order (member benefit, wheel, event, VIP, referral and free-shipping codes share the slot).

**Best voucher**: every usable code (own and public) is evaluated on the cart; the one that leaves the customer paying
the least is proposed — a capped 25% code worse than the 10% code is not preferred.

**Add-on suggestions**: in-stock shop products that unlock a better voucher the customer owns, only when the new basket
keeps ≥ 78% of its standard profit, earns the shop more than the current cart and meets the minimum profit. Ranked by
compatibility (same series/grade), extra profit, then smallest extra spend; never added automatically. The cart shows
the current and new payable amounts, the extra spend and the extra saving separately.

**Expiry reminders**: 72 h and 24 h before an owned code expires (website + email), once each, never for used codes.

## Admin tools

**Pricing and vouchers** page: resale candidates from a buyback price, list price for a target member price, the safe
voucher range with an 8–25% table, and a catalog simulation of a voucher (eligible/ineligible SKUs and why, average
discount, profit after discount, loss rate, products where it beats the 10% code, and whether it should be offered
catalog-wide).

## Compatibility

Deposits are computed after the voucher (1,222,222 list → 1,100,000 member price → 110,000 minimum deposit). Agent and
loyalty coupons keep their existing rules; plain legacy coupons without 4.0 terms keep their arithmetic. Confirmed
orders keep the voucher terms and the profit evaluation they were placed with (`order.benefitSnapshot`).

## Not implemented / open

- Per-product cost profiles (repair, packaging, handling, return allocation, payment fee) and price versions with
  approver are not separate tables yet; `importPrice` is the cost and `f = 0`.
- VIP paid plans, wheel and referral codes are not built.
- Tests: `tests/unit/pricing-vouchers.test.ts` (TC03–TC14, TC18, chapter V and VIII examples) and
  `tests/db/deposit-delivery.test.ts`.
