// payOS credentials are web-only; without all three, checkout keeps the verified manual bank transfer.
export const paymentsEnabled = () =>
  !!(
    process.env.PAYOS_CLIENT_ID?.trim() &&
    process.env.PAYOS_API_KEY?.trim() &&
    process.env.PAYOS_CHECKSUM_KEY?.trim()
  );
