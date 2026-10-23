# Promotions hub: checkout benefits, free shipping, voucher hunting

Checkout follows the owner's voucher and loyalty rules **v6.2** (2026-10-20, applied in the code on 2026-10-23): one main
voucher, at most one rank benefit on top of it, and a free-shipping code whose cost is part of the profit checks. The rules
and their sources are in [pricing-voucher-specification](pricing-voucher-specification.md); this page describes how the
shop applies them and the engagement features around them. Domain rules are pure functions in
`src/shared/voucher-stack.ts` and `src/shared/promotions.ts`; persistence is in
`src/core/server/services/PromotionService.ts` and `VoucherService.ts`. Every amount is whole VND.

It replaces the marketplace stacking of 2026-10-21 (`marketplace_v1`: sale price + one code + one free-shipping code +
points at 1 point = 500 VND, a points multiplier per tier and monthly free-shipping codes). Orders placed and points earned
under it keep their recorded terms.

## What an order can combine

1. **The price charged**: the list price, or the running sale price (the standard profit stays measured on the regular list
   price, so a sale plus a voucher is held to the profit of the regular member price).
2. **One main voucher** (`couponCode`): the member code, an admin or event code, a voucher drop, a wheel prize or a point
   voucher. Its percentage (with its published cap) or fixed amount is taken on the list price of the eligible lines. It
   must keep ≥ 80% of the standard profit L10, ≥ 50,000 VND and ≥ 5% of the goods paid, after the 1,120 VND per point
   reserve. Otherwise it is **refused with its reason, never shrunk**.
3. **The rank benefit** (automatic, signed-in members from Bronze up): +0.5% … +2% of the same list price, capped
   15,000 … 100,000, added only when the voucher alone passed and the pair keeps ≥ 75% of L10 and the same floors.
   Otherwise the voucher applies alone and the cart says the rank benefit is not available for this cart.
4. **One free-shipping code** (`freeshipCode`): up to its cap and the quoted carrier fee. Its cost is counted in the
   profit check of the voucher (or, with no voucher, the order alone must pass the floors); it is refused rather than make
   the order lose an accepted voucher or rank benefit.

Points are **not money at checkout**: `redeemPoints > 0` is refused with `POINTS_NOT_CASH` when an order is placed and
ignored by the cart quote. Points buy point vouchers and gifts in the member wallet (`/api/loyalty`).

Agent campaign codes (`source: agent`) are priced by their own approved rules (legal 50% limit, the agent's autonomy
policy and margin floor), take no rank benefit, and free shipping on top of them must still pass the checks.

The cart quotes non-strictly (`voucherStatus`, `voucherRefusal`, `rank`, `rankDiscountVnd`, `rankRefusal`,
`freeshipRefusal`, `earnedPoints`); placing an order is strict and throws `VOUCHER_NOT_ELIGIBLE`, `FREESHIP_NOT_ELIGIBLE`,
`POINTS_NOT_CASH` or `PRICE_CHANGED`. Only accepted benefits are sent. The order keeps `couponCode`, `freeshipCode`,
`shippingDiscountVnd`, `discount` (voucher + rank) and the full evaluation in `benefitSnapshot` (`ruleVersion: 'v6.2'`; the
profit figures under `internal` are removed from every customer response).
`total = subtotal − discount + shippingFee − shippingDiscount`.

Lifecycle: placing reserves the codes; cancellation releases them (and gives back points spent by older orders); delivery
finalizes the codes.

## Free shipping by order size

| Code | Minimum order | Max off the shipping fee |
|---|---:|---:|
| FREESHIP30 | 500,000 | 30,000 |
| FREESHIP50 | 2,000,000 | 50,000 |

## Standing offers

`PromotionService.ensureStandingOffers` (60-second job) keeps the public FREESHIP30 and FREESHIP50 codes and the
`MEMBER-MONTHLY` 10% member template behind every "Giá thành viên". They are checked by v6.2 at use, created once, renewed
30 days before they lapse, and never overwritten after an admin edits them. Whether they may run without an approved
budget is an open owner question (see the specification).

## Tiers

Tiers follow lifetime points (one per 40,000 VND of goods paid on a completed order, no multiplier) and give the rank
benefit above: Bronze 150 (+0.5%, 15,000), Silver 250 (+0.75%, 25,000), Gold 500 (+1%, 40,000), Platinum 1,500 (+1.25%,
50,000), Emerald 3,500 (+1.5%, 65,000), Diamond 10,000 (+2%, 100,000). Admins can still restrict any code to a minimum
tier (`minTier`). The member card and the membership page show pending points: orders still processing, shipping, or
delivered with the cash-on-delivery payment not yet confirmed.

## Points for purchases before the policy (catch-up)

Approving the loyalty policy never replays history by itself. An admin can run `POST /api/admin/loyalty/catch-up`
(`{ confirm: true, reason }`): every paid, delivered, undisputed order without an `order:{id}` earn entry is rewarded,
oldest first, each in its own transaction and at most once. Run on the dev database on 2026-10-21 at the owner's request
(750 orders, 200,621 points, with the multiplier then in force; those entries keep it for refund recalculations).

## Hunting codes through engagement

Engagement needs the approved loyalty policy. Its points are spendable (on point vouchers only) but never count towards
tiers. These features are not in the owner documents; they are kept under the v6.2 checks pending an owner decision.

- **Daily check-in**: 1, 1, 2, 2, 3, 3, 5 points over a 7-day streak (Vietnam days). Day 7 also issues a 30,000 VND
  free-shipping code (`CHK…`). A missed day restarts the streak.
- **Lucky wheel**: one spin per Vietnam day, drawn server-side with `crypto.randomInt` over a 1,000 weight table:
  +2 points (300), +5 (150), +20 (40); free shipping 30k on orders from 300k (160); 3% capped 50k from 500k (110);
  5% capped 100k from 1M (40); "better luck" (200). Code prizes are single-use codes owned by the customer (`WFS…`,
  `WVC…`), main vouchers under the same checks.
- **Missions**, each paid once: complete profile 20, first delivered order 30, a review of at least 30 characters 15,
  share 5.
- **Timed voucher drops** at 00:00, 12:00 and 20:00 Vietnam time, created by the 60-second job for today and tomorrow
  (`D<YYMMDD>-<hh>`). Customers must save one before using it (`requiresClaim`); each has a limited number of saves:

  | Opens | Benefit | Minimum order | Saves |
  |---|---|---:|---:|
  | 00:00 | Free shipping 30k | 300k | 50 |
  | 12:00 | 8%, capped 100k | 800k | 30 |
  | 20:00 | 12%, capped 200k | 1.5M | 20 |

  Saving is atomic: `voucher_claim` is unique per (code, customer), and `claimedCount` is bounded by `claimLimit`.

Admin coupons can be made into drops too: benefit type (discount / free shipping with its cap), minimum tier, "customers
must save first", maximum saves and opening time.

## Screens

- **Home**: event banners (flash sale countdown, drops, wheel), quick doors and today's vouchers to save.
- **`/uu-dai`**: member card (tier, points for vouchers, the rank benefit), check-in strip, wheel, drops, missions and the
  tier table with each tier's rank benefit.
- **Product card and detail**: the discount is highlighted (sale/event ribbon or "member price −10%", free-shipping
  badge, countdown under 3 days, offer panel with the points the purchase earns).
- **Cart**: shop voucher and shipping voucher rows (the best one applied automatically, with the state and the rank
  benefit each code would carry in the picker), the rank benefit row, the points the order will earn, and each refusal
  with its plain reason.

## API

| Method and path | Access | Returns |
|---|---|---|
| `GET /api/promotions/hub` | public; personal when signed in | Everything the screens need (`member.rank` instead of the former perks) |
| `POST /api/promotions/checkin` | signed in | Today's check-in (`CHECKIN_DONE` if already done) |
| `POST /api/promotions/wheel` | signed in | Today's spin (`WHEEL_DONE` if already spun) |
| `POST /api/promotions/missions/:key` | signed in | The mission reward (`MISSION_INCOMPLETE`, `MISSION_DONE`) |
| `POST /api/promotions/vouchers/:id/claim` | signed in | The saved drop (`DROP_NOT_OPEN`, `EXPIRED`, `CLAIMED`, `SOLD_OUT`, `VOUCHER_TIER`) |
| `POST /api/vouchers/evaluate` | signed in | Every usable code on the cart with `status`, `discountVnd`, `rankDiscountVnd`, `reason`, plus the best ones |

`POST /api/promotions/perks` (monthly free-shipping codes per tier) was removed on 2026-10-23.

## Tests

- `tests/unit/voucher-stack.test.ts`: the v6.2 acceptance cases and the 324-combination matrix.
- `tests/unit/promotions.test.ts`: voucher, rank and free shipping together; points; check-in and wheel tables.
- `tests/db/promotions.test.ts`: a refused loss code, Diamond on the member code, the rank refused at 69.11%, points not
  cash, no profit figures for customers, drop saves and sell-out, check-in/wheel/missions, the tier rank in the hub.
