// Sends a payOS "payment succeeded" webhook for an open payment QR, signed with the shop's own PAYOS_CHECKSUM_KEY, so
// the whole paid flow (order created from the checkout session, payment recorded, waybill, emails) can be tested
// without moving money. Development and staging only: anyone holding the checksum key could do the same, which is
// why it never leaves the server.
//
//   In Docker:  docker compose exec web node dist/.next/scripts/payos-test-webhook.js --latest
//   Locally:    yarn payos:test-webhook --latest
//
// Options: --latest (the most recent open checkout QR) | --session <id, the number in MUC<id>> | --order <order id>
//          | --code <payOS order code>
//          --amount <VND> (default: the QR amount; less tests the "underpaid" alert)
//          --url <webhook URL> (default: this server, http://127.0.0.1:$PORT/api/payments/payos/webhook)
//          --force (send even when the QR is no longer waiting for payment, to test a repeated or late webhook)
import crypto from 'crypto';
import { loadEnvConfig } from '@next/env';
import { Client } from 'pg';

loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const flag = (name: string) => args.includes(`--${name}`);
const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const signature = (data: Record<string, unknown>, key: string) =>
  crypto
    .createHmac('sha256', key)
    .update(
      Object.keys(data)
        .sort()
        .map((name) => `${name}=${data[name] === null || data[name] === undefined ? '' : data[name]}`)
        .join('&'),
    )
    .digest('hex');

async function main() {
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY?.trim() || fail('PAYOS_CHECKSUM_KEY is not set.');
  const latest = flag('latest'),
    session = option('session'),
    order = option('order'),
    code = option('code');
  if (!latest && !session && !order && !code)
    fail('Give --latest, --session <id>, --order <id> or --code <payOS order code>.');
  const db = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await db.connect();
  // The open checkouts, to say which one to use when the chosen QR is not payable.
  const open = (
    await db.query(
      `SELECT id, "upfrontDueVnd", "expiresAt" FROM checkout_session WHERE status = 'OPEN' ORDER BY id DESC LIMIT 5`,
    )
  ).rows as { id: number; upfrontDueVnd: number; expiresAt: Date }[];
  const openHint = open.length
    ? `Open checkouts now: ${open.map((row) => `MUC${row.id} (${row.upfrontDueVnd} VND, until ${row.expiresAt.toLocaleTimeString()})`).join(', ')}.`
    : 'There is no open checkout now: press "Thanh toán" in the bag first.';
  const sessionId = latest ? (open[0]?.id ?? fail(openHint)) : session;
  const where = code
    ? ['"providerOrderCode" = $1', code]
    : sessionId
      ? ['"checkoutSessionId" = $1', sessionId]
      : ['"orderId" = $1 AND "checkoutSessionId" IS NULL', order];
  const { rows } = await db.query(
    `SELECT "providerOrderCode", "amountVnd", "paymentLinkId", description, status FROM order_payment_link
     WHERE ${where[0]} ORDER BY (status = 'PENDING') DESC, id DESC LIMIT 1`,
    [where[1]],
  );
  await db.end();
  const link = rows[0] || fail(`No payment QR found. ${openHint}`);
  if (link.status !== 'PENDING' && !flag('force'))
    fail(
      `The QR ${link.description} is ${link.status}, not waiting for payment: nothing sent. ${openHint}` +
        ' (Add --force to send it anyway and test a repeated or late webhook.)',
    );
  const amount = Number(option('amount') || link.amountVnd);
  const data = {
    orderCode: Number(link.providerOrderCode),
    amount,
    description: link.description || '',
    accountNumber: '0000000000',
    reference: `TEST${Date.now()}`,
    transactionDateTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
    currency: 'VND',
    paymentLinkId: link.paymentLinkId || '',
    code: '00',
    desc: 'success',
    counterAccountBankId: '',
    counterAccountBankName: '',
    counterAccountName: 'TEST PAYMENT',
    counterAccountNumber: '',
    virtualAccountName: '',
    virtualAccountNumber: '',
  };
  const url = option('url') || `http://127.0.0.1:${process.env.PORT || 6050}/api/payments/payos/webhook`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: '00', desc: 'success', success: true, data, signature: signature(data, checksumKey) }),
  });
  console.log(`Simulated payOS payment for ${link.description} (no money moved): ${amount} VND → ${url}`);
  console.log(`${response.status} ${await response.text()}`);
}

main().catch((error) => fail(String(error)));
