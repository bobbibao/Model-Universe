// payOS credentials are web-only; without all three, checkout keeps the verified manual bank transfer.
export const paymentsEnabled = () =>
  !!(
    process.env.PAYOS_CLIENT_ID?.trim() &&
    process.env.PAYOS_API_KEY?.trim() &&
    process.env.PAYOS_CHECKSUM_KEY?.trim()
  );

// How long an order placed without its upfront payment (manual bank transfer) waits for it before it is cancelled
// (ORDER_PAYMENT_HOURS, 1–72, default 24).
export const orderPaymentHours = () => Math.min(72, Math.max(1, Number(process.env.ORDER_PAYMENT_HOURS?.trim()) || 24));

// How long a payment QR stays valid (PAYOS_LINK_MINUTES, 5–1440, default 30): the checkout countdown.
export const paymentLinkMinutes = () =>
  Math.min(1440, Math.max(5, Number(process.env.PAYOS_LINK_MINUTES?.trim()) || 30));
