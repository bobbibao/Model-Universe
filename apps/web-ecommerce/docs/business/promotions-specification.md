# Promotions hub: stacked benefits, free shipping, voucher hunting

Owner decisions of 2026-10-21 (marketplace model, as Shopee/Lazada/TikTok Shop run it). Domain rules are pure
functions in `src/shared/promotions.ts`; persistence and money movement are in
`src/core/server/services/PromotionService.ts`. Every amount is whole VND.

## Stacking (`stacking: marketplace_v1`)

An order can combine, in this order:

1. the **sale price** (flash sale / event price) already in the line price;
2. **one discount code** (admin, member, drop, wheel, reward voucher or agent code);
3. **one free-shipping code**, taking money off the carrier fee up to its cap;
4. **points**: 1 point = 500 VND, at most 10% of the goods, never more than the goods left after the code.

`evaluateStack` checks the whole stack against **one profit floor** (`pricing.ts`: keep 80% of L10 on one product,
78% on a basket):

- A shop-funded discount code is always profit-guarded. If it would sell below the floor it is **refused with its
  reason**, never silently shrunk.
- Free shipping applies only if the room left above the floor covers it (`profit_floor` refusal otherwise), the order
  meets the minimum and has a shipping fee.
- Points take the smaller of what is owned, the 10% share and the remaining profit room.
- Prepaid codes are approved discounts and skip the floor for their own amount: agent codes (approved under the
  autonomy policy) and reward vouchers bought with points (`source: loyalty`, `profitGuard: false`). Free shipping and
  points on top of them must still fit.

The cart quotes non-strictly (refusals are shown next to the code); placing an order is strict and throws
`VOUCHER_NOT_ELIGIBLE`, `FREESHIP_NOT_ELIGIBLE` or `POINTS_LIMIT`. Only accepted benefits are sent. The order keeps
`couponCode`, `freeshipCode`, `shippingDiscountVnd`, `pointsUsed` and the full evaluation in `benefitSnapshot`.
`total = subtotal − discount (code + points) + shippingFee − shippingDiscount`.

Lifecycle: placing reserves the codes and spends the points (`order-points:{id}`); cancellation releases the codes and
restores the points (`order-points-restore:{id}`); delivery finalizes the codes.

## Free shipping by order size

| Code | Minimum order | Max off the shipping fee |
|---|---:|---:|
| FREESHIP30 | 500,000 | 30,000 |
| FREESHIP50 | 2,000,000 | 50,000 |
| Tier codes (GOLD+) | per code | 50,000–70,000 |

## Tier perks

See the tier table in [loyalty-specification.md](loyalty-specification.md): a points multiplier and monthly free-shipping
codes (`FS<YYMM>-<user>-<n>`, issued once per Vietnam month, expiring at month end) replace the flat tier discount.

## Hunting codes through engagement

Engagement needs the approved loyalty policy. Its points are spendable but never count towards tiers.

- **Daily check-in**: 1, 1, 2, 2, 3, 3, 5 points over a 7-day streak (Vietnam days). Day 7 also issues a 30,000 VND
  free-shipping code (`CHK…`). A missed day restarts the streak.
- **Lucky wheel**: one spin per Vietnam day, drawn server-side with `crypto.randomInt` over a 1,000 weight table:
  - +2 points (300), +5 (150), +20 (40);
  - free shipping 30k on orders from 300k (160);
  - 3% capped 50k from 500k (110);
  - 5% capped 100k from 1M (40);
  - "better luck" (200).

  Code prizes are profit-guarded, single-use codes owned by the customer (`WFS…`, `WVC…`).
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
- **`/uu-dai`**: member card, check-in strip, wheel, drops, missions and tier ladder.
- **Product card and detail**: the discount is highlighted (sale/event ribbon or "member price −10%", free-shipping
  badge, countdown under 3 days, offer panel with code chips).
- **Cart**: discount code, free-shipping code, points toggle, the wallet's best code and best free shipping, and each
  refusal with its reason.

## API

| Method and path | Access | Returns |
|---|---|---|
| `GET /api/promotions/hub` | public; personal when signed in | Everything the screens need |
| `POST /api/promotions/checkin` | signed in | Today's check-in (`CHECKIN_DONE` if already done) |
| `POST /api/promotions/wheel` | signed in | Today's spin (`WHEEL_DONE` if already spun) |
| `POST /api/promotions/missions/:key` | signed in | The mission reward (`MISSION_INCOMPLETE`, `MISSION_DONE`) |
| `POST /api/promotions/vouchers/:id/claim` | signed in | The saved drop (`DROP_NOT_OPEN`, `EXPIRED`, `CLAIMED`, `SOLD_OUT`, `VOUCHER_TIER`) |
| `POST /api/promotions/perks` | signed in | This month's tier free-shipping codes |

## Tests

- `tests/unit/promotions.test.ts`: stack, floor, multiplier, check-in, wheel and drop tables.
- `tests/db/promotions.test.ts`: refused loss code, stack and cancellation restore, drop saves and sell-out,
  check-in/wheel/missions, monthly perks.
