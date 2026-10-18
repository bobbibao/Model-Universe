# Testing online payment without real money

The checkout creates an order only when payOS confirms the payment. To test that flow in development, the shop can send
itself the exact webhook payOS would send, signed with its own `PAYOS_CHECKSUM_KEY`. No money moves and payOS is not
involved; the server cannot tell the difference, so this must never be run against production data.

## 1. Open a payment QR

- **Checkout:** add a product to the bag, choose the address, press **Thanh toán**, then **Thanh toán bằng mã QR**.
  The dialog shows the memo `MUC<id>`: `<id>` is the checkout session.
- **An existing order that still owes money:** open it under *Tài khoản → Đơn hàng* and press **Hiện mã QR thanh
  toán**. Use the order number.

## 2. Send the "paid" webhook

From `infra/`, with the stack running (`docker compose --profile mail up -d`):

```bash
# a checkout session (the number in MUC<id>)
docker compose exec web node dist/.next/scripts/payos-test-webhook.js --session 3

# an existing order's open QR
docker compose exec web node dist/.next/scripts/payos-test-webhook.js --order 895

# pay less than asked: the shop gets a "THANH TOÁN ONLINE CẦN KIỂM TRA" alert and no order is created
docker compose exec web node dist/.next/scripts/payos-test-webhook.js --session 3 --amount 10000

# through the public tunnel instead of the local server (tests the URL payOS really calls)
docker compose exec web node dist/.next/scripts/payos-test-webhook.js --session 3 \
  --url https://<tunnel>.trycloudflare.com/api/payments/payos/webhook
```

Without Docker (from `apps/web-ecommerce`, with `.env` holding the database and payOS settings):
`yarn payos:test-webhook --session 3`.

The script prints `200 {"recorded":true}` when the payment was accepted. Within three seconds the open QR dialog moves
to the thank-you page; the order, the "Xác nhận đơn hàng" and waybill emails (Mailpit, http://localhost:8025) and the
simulated waybill appear.

## 3. What to check

| Case | How | Expected |
| --- | --- | --- |
| Paid deposit | `--session <id>` on a deposit QR | Order with the deposit recorded, COD = the rest, waybill created |
| Paid in full | switch to **Toàn bộ** in the dialog, then `--session <id>` | Order paid, COD 0 |
| Plan switch | switch plans, then send for the session | Only the latest QR counts; the old one is cancelled at payOS |
| Repeated webhook | run the same command twice | One order, one payment, one email |
| Forged webhook | change `PAYOS_CHECKSUM_KEY` for the command (`-e PAYOS_CHECKSUM_KEY=x`) | `401`, nothing recorded |
| Underpaid | `--amount` below the QR amount | Staff alert, session not completed, no order |
| Expired QR | wait for the countdown (or set `PAYOS_LINK_MINUTES=5`) | "Mã QR đã hết hạn", no order; "Tạo mã QR mới" makes a new one |
| Cancelled | **Hủy thanh toán** in the dialog | No order; the bag is kept |
| Orders page | leave a QR open, go to *Tài khoản → Đơn hàng* | "Đang chờ thanh toán" with the same QR and countdown; nothing new is created |

## 4. Carrier status (SuperAI)

Waybills are simulated in development (`SUPERAI_ORDER_MODE=simulate`). Staff move them through the statuses on the
admin order page (**Mô phỏng trạng thái vận chuyển**); each change sends the customer the same notices a real carrier
update would. With live waybills, SuperAI calls `POST /api/shipping/superai/webhook?token=<SUPERAI_WEBHOOK_TOKEN>`
(registered in *Admin → Giao hàng SuperAI*); the shop then reads the real status back from SuperAI.
