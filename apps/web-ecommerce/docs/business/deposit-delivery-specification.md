# Deposit orders, QR checkout and delivery through SuperAI

Canonical English interpretation of the owner's "deposit purchase and automatic delivery" specification 1.0
([original](source/vi/deposit-delivery-specification.md)), with the owner's changes: 2026-10-17 **payOS takes online
payments** and the waybill is created automatically once the upfront payment is verified; 2026-10-18 **SuperAI
replaces GHN** so the cheapest carrier ships each order, **the order exists only once the payment succeeds** (a QR
dialog with a 30-minute countdown in which the customer may change how to pay), and **saved addresses** are offered at
checkout.

## Money

- Two ways to pay (owner decision 2026-10-18): the deposit or the full total. The deposit is 10% of the merchandise
  after the voucher, but never less than the shipping fee (the shop pays the carrier even when a parcel is refused) nor
  than what the carrier cannot collect on delivery; it is a prepayment for the order, not a reservation hold.
- The carrier fee is quoted at checkout for the address and is part of the order total:
  `total = merchandise − voucher + carrier fee`. The shop pays the carrier (SuperAI `payer = 1`), so
  `COD = total − verified payments` and the fee never changes the deposit basis.
- The carrier collects at most `SHIPPING_COD_LIMIT_VND` (default 50,000,000) on delivery; checkout raises the minimum
  upfront payment to `total − COD limit`.
- Verified top-ups are allowed before a waybill exists; the COD is computed from them.
- The server recomputes every amount (`src/shared/payment.ts`, `src/shared/fulfillment.ts`).

## QR checkout (payOS)

- With payOS configured, "Pay" opens a checkout session (`POST /api/checkout/sessions`) instead of an order. The server
  validates the request exactly as placing the order would (prices, stock, voucher, carrier fee, deposit) and returns
  a VietQR payment for the upfront amount, shown in a dialog with the receiving account, amount and memo (`MUC<id>`)
  and a countdown of `PAYOS_LINK_MINUTES` (30 by default).
- While the QR is open the customer can switch between the deposit and full payment: the totals are checked
  again, the old payOS link is cancelled and a new QR with a fresh countdown replaces it. Cancelling closes the session.
  Closing the dialog keeps the session; the bag offers "continue payment", also after a reload in the same tab.
- The order is created only when payOS confirms the money: the signed webhook (`POST /api/payments/payos/webhook`,
  verified with the checksum key by the official SDK) or a server-side status check while the dialog polls (every 3
  seconds) or after returning from the payOS page. The browser's return URL alone proves nothing. The order is then
  placed with exactly the session's request (idempotent through the checkout key), the payment is recorded once in
  `order_prepayment` (reference `PAYOS-<bank reference>`, unique across every money ledger), and the waybill follows.
- Nothing is reserved while the QR is open. A payment that cannot become an order (sold out or price changed meanwhile,
  short amount, a second payment for the same session) alerts staff for a refund; the session becomes `FAILED`. Money
  that arrives after the countdown still becomes the order the customer paid for.
- An unpaid session expires at its deadline (no order). Without `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`,
  `PAYOS_CHECKSUM_KEY` checkout places the order directly and keeps the verified manual bank transfer; existing orders
  that still owe their upfront payment keep "pay online" on the order and thank-you pages.

- The orders page lists checkouts still waiting for payment with their QR and countdown, and an order that still owes
  its upfront payment shows its open QR again. Viewing never creates a payment; a new QR is made only when the customer
  asks for one. Testing without real money: [testing-online-payment.md](../testing-online-payment.md).

## Holding stock and payment deadlines (as large marketplaces do)

- While a checkout's QR is open its models are held (taken out of stock) for that customer; they come back when the
  QR expires, is cancelled or the payment fails, and the paid order takes them over in the same transaction. A
  customer has one open checkout at a time (a new one replaces the earlier one and its hold).
- An order placed without its upfront payment (manual bank transfer, or from before QR checkout) must be paid within
  `ORDER_PAYMENT_HOURS` (24 by default; `order.paymentDueAt`). Its QR is offered only before then; afterwards the
  order is cancelled automatically (`payment_timeout`, by the system), its stock released, its open QR cancelled at
  payOS and the customer told. Placing it again from the bag gives current prices and stock.
- A cancellation request staff do not answer within 24 hours is approved automatically; the refund is flagged for
  staff and the customer is told.

## Purchases page

The customer's orders are organised like large marketplaces' "Đơn mua": tabs Tất cả, Chờ thanh toán (open QR checkouts
and unpaid orders), Chờ giao hàng, Đang giao, Đã giao, Đã huỷ, with counts on the tabs that need attention. Each order
card shows its state, the next step (carrier and status, payment deadline, appointment), the items and total, and the
actions that apply now (Thanh toán, Theo dõi đơn, Huỷ / Yêu cầu huỷ, Mua lại, Đánh giá). The detail adds a progress
stepper (placed → paid → with the carrier → out for delivery → delivered, or cancelled) with times, tracking, payments,
and for a cancelled order who cancelled it, why, and the refund.

## Cancellation

Every cancellation records a reason (and a note for "other") and who cancelled (`src/shared/cancellation.ts`):

- Customer, while the order is processing: cancelled at once when nothing was paid and no waybill exists; otherwise
  (money received, or a waybill waiting for pickup) a cancellation request staff accept (the waybill is cancelled with
  the carrier, then the refund is recorded) or turn down with a note the customer reads. Reservation orders keep their
  money with the reservation and cancel at once.
- Once the carrier picked the parcel up, nobody can cancel: the customer refuses the parcel or asks for a return.
- Staff cancel with a staff reason (customer request, out of stock, unreachable, unpaid, address not served, suspected
  fraud, other); a waybill still waiting for pickup is cancelled with the carrier first.

## Address (SuperAI areas)

SuperAI and the carriers route by the three-level units (province → district → ward/commune; the 2025 two-level names
are refused by its price API). Checkout uses SuperAI's public area lists (`areas/province`, `areas/district`,
`areas/commune`, cached a day): searchable lists (accent- and prefix-insensitive: "q1", "quan 1" and "Quận 1" match),
the house number and street with Openmap.vn suggestions in the same three-level naming (`admin_v2=false`) that fill
all three levels at once, and a map (MapLibre with the Openmap style, or CARTO raster tiles) whose pin can be dragged to
the exact door, with a reverse lookup. The server checks that the ward belongs to the district and the district to the
province, and takes the names from SuperAI's lists.

Saved addresses: every paid checkout adds its address (recipient, phone, structured address) to the customer's address
book unless it is already there (then it moves to the top), up to 20. Checkout shows them as cards and preselects the
most recent; the address book edits them with the same picker. Addresses saved before (text only) are matched by name
and the customer completes the missing levels.

## Carrier choice and waybill

- `orders/price` quotes every connected carrier (GHN, J&T Express, Viettel Post, BEST Express, SPX Express, VNPost…) for
  the route, the billable weight (the larger of the real and the volumetric weight L×W×H/5000) and the declared value
  (the goods, for insurance). Checkout charges the cheapest fee + insurance (ties: the faster estimate, then the lower
  carrier id) and shows the comparison; the order keeps that quote (`order.shippingQuote`).
- The waybill is created automatically after the deposit or full payment is verified (Admin → SuperAI delivery can turn
  this off), or by staff from the order page, where the carriers can be compared again and another one chosen. Checks:
  verified deposit, complete address, products not held back, package size and weight, COD within the limit, no other
  active waybill. The pickup point is the SuperAI warehouse chosen in the admin settings (`pickup_code`); `soc` =
  `MU<order id>`, and the waybill request key makes creation idempotent here.
- Modes (`SUPERAI_ORDER_MODE`): SuperAI has no sandbox, so `simulate` (default) quotes for real but creates `SIM…` codes
  and staff simulate statuses (development, tests); `live` books the real carrier and staff can cancel through the API.
- Status: SuperAI's callback (`POST /api/shipping/superai/webhook?token=<SUPERAI_WEBHOOK_TOKEN>`; registered from the
  admin settings and applying to orders created afterwards). SuperAI does not sign it, so for a live waybill the status
  is read back from `orders/info` instead of trusted from the body. Also a pull when the customer or staff refresh (at
  most once a minute, also for local development where SuperAI cannot reach the server). Events are deduplicated by
  code + status + update time. SuperAI's status codes map to `AWAITING_PICKUP, PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY,
  DELIVERED, DELIVERY_FAILED, RETURNING, RETURNED, CANCELLED, EXCEPTION` (not picked up, partly delivered, lost and
  compensated are incidents for staff); picked up → order `SHIPPED`, delivered → `DELIVERED` with the COD still
  awaiting reconciliation.

## End-of-day label printing (Admin → Giao hàng → In phiếu giao hàng)

- The page lists the parcels still at the shop (waybill created, not picked up), by waybill day and print status, and
  first the paid orders that still have no waybill (with a "create waybill" button; the system also retries every
  10 minutes).
- Staff choose the parcels (unprinted ones are preselected) and the label size (A6, 100×150 mm thermal, or four per
  A4 page) and create a print run. The run is recorded (who, when, which waybills, how many were reprints) and each
  waybill keeps when and how often its label was printed.
- One PDF holds a label per parcel: carrier, the waybill code as a Code 128 barcode, sender (the SuperAI warehouse),
  receiver, cash to collect on delivery (or "paid"), order code, weight, items, the view/try rule, the shop's order code
  barcode, and "MÔ PHỎNG – KHÔNG GỬI" on simulated waybills. It opens in the browser's print dialog (any label or office
  printer, or "Save as PDF") and can be downloaded; a CSV checklist (opens in Excel) lists the same parcels. For live
  waybills the carriers' official labels open from SuperAI too. Every earlier run can be downloaded again.
- A parcel the carrier has picked up can no longer be put in a print run.

## Automatic synchronisation

Webhooks are the fast path; a job every minute is the safety net, so no order stays stuck between steps: open QR
checkouts are checked with payOS (the order is created, or the QR expires), open payment QRs of existing orders are
checked, paid courier orders without a waybill get it retried (every 10 minutes), and live waybills read their status
back from SuperAI (every 15 minutes). Every step is idempotent and recorded on the order (payments, waybill events,
notices), so the order page shows the whole history from payment to delivery.

## Customer tracking and notifications

The order page shows the carrier, its tracking code (SuperAI's code until the carrier assigns one), a progress bar
(created → picked up → in transit → out for delivery → delivered), the event history and the carrier's tracking page
(GHN, J&T Express, Viettel Post, BEST Express, SPX Express; VNPost parcels are followed on the order page). The customer receives the carrier and tracking code and each important status (picked up, out for
delivery, delivered, failed, returned, incident) on the website and by email, and by Zalo ZNS when an approved template
is configured (`ZALO_ZNS_ACCESS_TOKEN`, `ZALO_ZNS_TEMPLATE_ID`, parameters `order_code`, `tracking_code`, `status`).
The shop receives alerts for new deposit orders, waybills, refused waybills, failed deliveries and payments to check, in
Admin → Operational alerts and on its Zalo OA when configured.

## In-person handover

Unchanged: `WAITING_FOR_APPOINTMENT → (CHANGE_REQUESTED) → APPOINTMENT_CONFIRMED → COMPLETED` or `NOT_HELD`; completion
needs the customer's handover code, the checked items and the verified balance. With payOS it is paid through the same
QR checkout.

## Open decisions

Deposit deadline, preparation time, deposit refund on cancellation, no-show policy, handover fee, who pays the return
fee after a failed delivery, top-ups after a waybill (currently refused), the official Zalo channel, the shop's COD
limit with SuperAI, and whether a fixed carrier allow-list is wanted instead of always the cheapest.

Code: `CheckoutService`, `ShipmentPrintService`, `OrderSyncService`, `ShippingService`, `FulfillmentService`, `PaymentGatewayService`, `delivery/SuperAiClient.ts`,
`delivery/Geocoder.ts`, `delivery/OpenMapClient.ts`, `delivery/ZaloClient.ts`; UI `components/Address/AddressPicker.tsx`,
`features/cart/components/CheckoutPaymentModal.tsx`, `SavedAddressCards.tsx`; tests `tests/unit/superai-client.test.ts`,
`tests/db/deposit-delivery.test.ts`.
