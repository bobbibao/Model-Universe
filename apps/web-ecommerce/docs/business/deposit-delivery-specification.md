# Deposit orders, online payment and GHN delivery

Canonical English interpretation of the owner's "deposit purchase and automatic delivery" specification 1.0
([original](source/vi/deposit-delivery-specification.md)), with the owner's change of 2026-10-17: **GHN replaces SPX**
(SPX publishes no usable API), **payOS takes online payments**, and the GHN order is created automatically once the
upfront payment is verified.

## Money

- Deposit from 10% of the merchandise after the voucher, up to the full total; it is a prepayment for the order, not a
  reservation hold. The order is confirmed only once the payment is verified.
- The GHN fee is quoted at checkout for the address and is part of the order total:
  `total = merchandise − voucher + GHN fee`. The shop pays GHN (`payment_type_id = 1`), so
  `COD = total − verified payments` and the fee never changes the deposit basis.
- GHN collects at most the shop's COD limit. A shop GHN has not verified yet has low limits (this shop, 2026-10-17:
  COD above 300,000 and declared value above 500,000 VND were refused): set `GHN_COD_LIMIT_VND` and
  `GHN_INSURANCE_LIMIT_VND`. Checkout then raises the minimum upfront payment to `total − COD limit`, and the declared
  (insurance) value is capped.
- Verified top-ups are allowed before a waybill exists; the COD is computed from them.
- The server recomputes every amount (`src/shared/payment.ts`, `src/shared/fulfillment.ts`).

## Online payment (payOS)

- After placing the order the customer goes to the payOS page (VietQR) for the deposit or full amount; the order page
  and the thank-you page offer "pay online" again while it is due.
- A payment counts only when payOS confirms it: the signed webhook (`POST /api/payments/payos/webhook`, verified with
  the checksum key by the official SDK) or a server-side status check when the customer returns. The browser's return
  URL alone proves nothing.
- Each confirmed payment is recorded exactly once in `order_prepayment` (reference `PAYOS-<bank reference>`, unique across
  every money ledger); a payment that cannot be applied (cancelled order, short amount) alerts staff for a refund.
- Without `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` checkout keeps the verified manual bank transfer.

## Address (GHN two-level model)

Since 01/07/2025 addresses are province → ward (no district). Checkout and the shop's pickup address use GHN's master
data (`v3/master-data/province/all`, `ward/all-by-province-id`): searchable province and ward lists (accent-insensitive,
with GHN's alternative names), the house number and street with suggestions, and a map (Leaflet with CARTO tiles of
OpenStreetMap data; address search and reverse lookup through Photon, or Nominatim with `GEOCODER_PROVIDER=nominatim`,
proxied, cached and throttled to one request per second by the server; openstreetmap.org itself is blocked by some
Vietnamese networks) whose pin can be dragged to the exact door. The server checks that the ward belongs to the province. GHN also checks that the street text matches
the ward (`TO_ADDRESS_CONFLICT`), so the full address `street, ward, province` is sent.

## GHN order

- Created automatically after the deposit or full payment is verified (Admin → GHN delivery can turn this off), or by
  staff from the order page. Checks: verified deposit, complete address, products not held back, package size and
  weight, COD within the limit, no other active waybill. `client_order_code = MU<order id>` makes creation idempotent at
  GHN, and the waybill request key makes it idempotent here.
- Modes (`GHN_ORDER_MODE`): `live` (default with a token) creates real orders, a courier comes to the pickup address,
  staff can cancel through the API; `simulate` creates `SIM…` codes and staff simulate statuses (development, tests).
- Status: GHN's callback (`POST /api/shipping/ghn/webhook`, authenticated by the custom header `X-Webhook-Token` =
  `GHN_WEBHOOK_TOKEN` configured in GHN's webhook settings, deduplicated by OrderCode + Type + Time) and a pull of the
  order detail when the customer or staff refresh (at most once a minute, also for local development where GHN cannot
  reach the server). GHN statuses map to `AWAITING_PICKUP, PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED,
  DELIVERY_FAILED, RETURNING, RETURNED, CANCELLED, EXCEPTION`; picked up → order `SHIPPED`, delivered → `DELIVERED`
  with the COD still awaiting reconciliation.

## Customer tracking and notifications

The order page shows the GHN tracking code, a progress bar (created → picked up → in transit → out for delivery →
delivered), the delivery estimate, the event history and a link to GHN's tracking page. The customer receives the
tracking code and each important status (picked up, out for delivery, delivered, failed, returned, incident) on the
website and by email, and by Zalo ZNS when an approved template is configured (`ZALO_ZNS_ACCESS_TOKEN`,
`ZALO_ZNS_TEMPLATE_ID`, parameters `order_code`, `tracking_code`, `status`). The shop receives alerts for new deposit
orders, GHN orders, refused waybills, failed deliveries and payments to check, in Admin → Operational alerts and on its
Zalo OA when configured.

## In-person handover

Unchanged: `WAITING_FOR_APPOINTMENT → (CHANGE_REQUESTED) → APPOINTMENT_CONFIRMED → COMPLETED` or `NOT_HELD`; completion
needs the customer's handover code, the checked items and the verified balance.

## Open decisions

Deposit deadline, preparation time, deposit refund on cancellation, no-show policy, handover fee, who pays GHN's return
fee after a failed delivery, top-ups after a waybill (currently refused), the official Zalo channel, and the shop's real
GHN limits after verification.

Code: `ShippingService`, `FulfillmentService`, `PaymentGatewayService`, `delivery/GhnClient.ts`, `delivery/Geocoder.ts`,
`delivery/ZaloClient.ts`; UI `components/Address/AddressPicker.tsx`; tests `tests/unit/ghn-client.test.ts`,
`tests/db/deposit-delivery.test.ts`.
