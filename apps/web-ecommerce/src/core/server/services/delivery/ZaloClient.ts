// Shop alerts on Zalo (docs/business/deposit-delivery-specification.md, chapter V). Only an official integration is
// used: a Zalo Official Account sends a customer-service message to the staff members who follow it. `ZALO_MODE=off`
// (the default) sends nothing: every alert stays in the admin's alert list for staff to read and forward by hand,
// which is the fallback the specification requires when no permitted integration exists.

export type ZaloMode = 'off' | 'live';

export interface ZaloResult {
  status: 'sent' | 'failed' | 'skipped';
  providerMessageId?: string | null;
  error?: string | null;
}

const env = (name: string) => process.env[name]?.trim() ?? '';

export const zaloMode = (): ZaloMode => {
  const value = env('ZALO_MODE') || 'off';
  if (value !== 'off' && value !== 'live') throw new Error('ZALO_MODE must be off or live');
  return value;
};

// Zalo user ids (as seen by the Official Account) of the staff who receive alerts.
export const zaloRecipients = () =>
  env('ZALO_ADMIN_USER_IDS')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

export const assertZaloConfig = () => {
  if (zaloMode() !== 'live') return;
  const missing = ['ZALO_OA_ACCESS_TOKEN', 'ZALO_ADMIN_USER_IDS'].filter((name) => !env(name));
  if (missing.length) throw new Error(`ZALO_MODE=live needs ${missing.join(', ')}`);
};

// Official Account API v3: POST /v3.0/oa/message/cs with the OA access token. The token is web-only.
export const sendZaloText = async (
  userId: string,
  text: string,
  fetcher: typeof fetch = fetch,
): Promise<ZaloResult> => {
  if (zaloMode() !== 'live') return { status: 'skipped', error: 'ZALO_MODE=off: kept as an admin alert' };
  try {
    const response = await fetcher('https://openapi.zalo.me/v3.0/oa/message/cs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: env('ZALO_OA_ACCESS_TOKEN') },
      body: JSON.stringify({ recipient: { user_id: userId }, message: { text: text.slice(0, 2000) } }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: number;
      message?: string;
      data?: { message_id?: string };
    };
    if (!response.ok || body.error)
      return { status: 'failed', error: `Zalo ${response.status} ${body.error ?? ''} ${body.message ?? ''}`.trim() };
    return { status: 'sent', providerMessageId: body.data?.message_id ?? null };
  } catch (error) {
    return { status: 'failed', error: (error as Error).message };
  }
};

// Customer messages through Zalo Notification Service (ZNS): an approved template sent to the customer's phone number.
// Needs a ZNS access token of the Official Account and one approved template whose parameters are order_code,
// tracking_code and status (ZALO_ZNS_TEMPLATE_ID). Without them customers get the website notice and email only.
export const znsEnabled = () => !!(env('ZALO_ZNS_ACCESS_TOKEN') && env('ZALO_ZNS_TEMPLATE_ID'));

// 0901234567 / +84901234567 → 84901234567 (the format ZNS expects); null when it is not a Vietnamese mobile number.
export const znsPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  const local = digits.startsWith('84') ? digits.slice(2) : digits.startsWith('0') ? digits.slice(1) : digits;
  return /^[35789]\d{8}$/.test(local) ? `84${local}` : null;
};

export const sendZns = async (
  phone: string,
  templateData: Record<string, string>,
  trackingId: string,
  fetcher: typeof fetch = fetch,
): Promise<ZaloResult> => {
  if (!znsEnabled()) return { status: 'skipped', error: 'ZNS is not configured' };
  try {
    const response = await fetcher('https://business.openapi.zalo.me/message/template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: env('ZALO_ZNS_ACCESS_TOKEN') },
      body: JSON.stringify({
        phone,
        template_id: env('ZALO_ZNS_TEMPLATE_ID'),
        template_data: templateData,
        tracking_id: trackingId.slice(0, 48),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: number;
      message?: string;
      data?: { msg_id?: string };
    };
    if (!response.ok || body.error)
      return { status: 'failed', error: `ZNS ${response.status} ${body.error ?? ''} ${body.message ?? ''}`.trim() };
    return { status: 'sent', providerMessageId: body.data?.msg_id ?? null };
  } catch (error) {
    return { status: 'failed', error: (error as Error).message };
  }
};
