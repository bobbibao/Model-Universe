# Model Universe Buyback policy

Canonical English operational interpretation of the owner's buyback policy and the buyback specification 2.0
("all ordinary issues deduct 50,000 VND each"), received 2026-10-16, **with the price table replaced by the one fixed in
the unified rules v5.0 of 2026-10-20** ([source](source/vi/unified-business-rules-v5.md)); the owner edited the policy
and the specification to the same table that day (sections E and F of the
[folder addenda](source/vi/drive-folder-addenda-2026-10-20.md)). Original evidence:
[policy](source/vi/buyback-policy.md), [specification](source/vi/buyback-specification.md); the superseded first
policy is kept as [buyback-policy-v1](source/vi/buyback-policy-v1.md). Open questions stay in the
[decision register](../model-universe/business-requirements.md#9-decision-register).

Principle: right item, right condition, right price. The price shown before inspection is only an estimate; the shop
records the unboxing, inspects, and the customer accepts, asks for a re-inspection, or declines.

## Pricing

Reference price = the shop's actual selling price of the same model and version. Pricing rules 4.0
([pricing-voucher-specification](pricing-voucher-specification.md)) require the real selling price S (the member price
after the standard 10% voucher), never the list price R, so the system uses `memberPrice(product.price)` of the chosen
catalog model. A price typed by the customer is never a reference.

Applies to complete, undamaged goods. The tier is chosen by the **reference selling price S**, never by the amount paid B.

| Reference price S (inclusive upper bound) | Base deduction | Example |
|---|---|---|
| ≤ 500,000 | 100,000 | 500,000 → 400,000 |
| ≤ 1,000,000 | 200,000 | 1,000,000 → 800,000 |
| ≤ 1,500,000 | 250,000 | 1,500,000 → 1,250,000 |
| ≤ 2,000,000 | 350,000 | 2,000,000 → 1,650,000 |
| ≤ 3,000,000 | 450,000 | 3,000,000 → 2,550,000 |
| ≤ 5,000,000 | 500,000 | 5,000,000 → 4,500,000 |
| > 5,000,000 | manual price by staff, never computed | |

Version 2.0's table (150k / 200k / 300k / 400k for the 1M / 1.5M / 2M / 3M bands) is superseded; requests quoted before
the change keep their recorded deduction. Worked examples with the new table: 1,500,000 with a missing box and one broken
part → 1,150,000; 2,000,000 with 7 issues → 1,300,000; 2,000,000 with a missing box, one broken part and two missing
accessories → 1,450,000, and 1,350,000 after inspection finds one more broken part and one more missing accessory.

`estimate = MAX(0, reference − base deduction − 50,000 × valid issue count)`.

- **Working back from a known buy-in price B:** try every candidate `S = B + tier deduction` and keep only a candidate
  that falls in its own band; when several qualify, propose the **lowest valid S** and record the others. An Admin makes the
  final call on market and cost. Example: B = 900,000 with no defects → S = 1,150,000 (not 1,100,000).
- Every ordinary issue deducts 50,000 VND per counting unit, whatever the model's value: broken or cracked part (each),
  missing accessory (each), glue mark (each spot), loose joint (each), scratched area (each), missing decal (each item),
  missing small detail (each), other issue (each, described).
- Missing box, damaged box and poor assembly count once for the whole model; a condition reported twice is not charged
  twice. One damage with several symptoms (a broken part glued back) is one issue unless staff record why it is two.
- Serious damage (lost function, major deformation, missing key parts), no catalog reference, a reference above
  5,000,000 VND, or a zero estimate go to manual pricing. The system never raises the per-issue amount instead.
- Any amount other than the formula is a manual price and requires its reason; the customer must accept it.

Code: `src/shared/buyback-pricing.ts` (`BUYBACK_RULE_VERSION = buyback-5.0`, `resaleCandidates` lists every valid S
lowest first), tests `tests/unit/buyback-pricing.test.ts` (specification TC01–TC25 and v5.0 T1–T9).

## Flow and statuses

`submitted` → (`need_more_evidence`) → `quoted` (preliminary) → `awaiting_item` → `inspecting` →
`awaiting_acceptance` ⇄ `reinspection_requested` → `awaiting_payout` → `completed`; or `returning` → `cancelled`.

1. The customer picks the catalog model (or none, for a manual valuation), declares issues with counts and
   descriptions, sees the estimate, uploads photos (front, back, sides, box, accessories laid out, each issue) and a
   video, and ticks the six confirmations (honest declaration, known issues, media, estimate only, inspection on
   arrival at 50,000 VND per issue, decision on the final price).
2. Media check: at least three distinct photos are required; a missing video or missing issue close-ups move the
   request to `need_more_evidence` with the list of what is missing. Staff can also ask for more; the customer adds
   files and the request returns to `submitted`.
3. Staff send the preliminary quote (formula by default, or a manual price with its reason).
4. Remote customers ship only after the shop accepts the request; shipping to the shop is paid by the customer.
   Inbound COD stays unsupported until an inspection-compatible policy is approved (D9).
5. On arrival staff record the unboxing and inspection (video/photos, stored as `buyback_inspection` evidence, visible
   to the customer) and list the inspected issues. A final offer cannot be sent without that recording.
6. The comparison runs both ways: new issues add 50,000 VND each, declared issues that are not there reduce the
   deduction. The customer receives the result on the website and by email.
7. The customer accepts, asks for a re-inspection (nothing can be accepted until staff answer with a new final offer),
   or declines (return under accepted return terms). Payment happens only after acceptance, from a verified payout;
   ownership and stock intake follow it (unchanged from 1.0).

Notifications: preliminary quote, received parcel (website + email), final quote "as declared" or "adjusted"
(website + email), evidence requests. Every action is a retained `buyback_event` with actor and version.

## Not implemented / open

- Buy-in and trade money the shop pays earns no points and uses no voucher (see
  [pricing-voucher-specification](pricing-voucher-specification.md)).
- Price tiers and issue types are versioned code constants, not admin-editable tables (`buyback_price_tiers`,
  `buyback_issue_types` in the specification). Changing them is a code change with tests.
- Return-shipping cost allocation after a disagreement stays a recorded agreement (`return_offer`), as in 1.0.
- Staff permissions are the single ADMIN role; the specification's separate inspector/cashier roles are not modelled.
