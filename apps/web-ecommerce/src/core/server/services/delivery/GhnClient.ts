import crypto from 'crypto';
import HttpError from '../../../../shared/server/utils/HttpError';
import Logger from '../../../../shared/server/utils/logger';
import type { ShipmentStatus } from '../../../../shared/fulfillment';

// GHN Express (https://developer.ghn.vn/vi/docs), two-level address model (province → ward, `is_new_*_address`).
// Credentials are web-only: GHN_TOKEN and GHN_SHOP_ID (the token's shop from `shop/all`). GHN_BASE_URL selects
// production (default) or staging (https://dev-online-gateway.ghn.vn); the two have separate accounts.
// GHN_ORDER_MODE:
//   live      creates real GHN orders (a courier comes to pick up) and cancels them through the API.
//   simulate  quotes and master data still come from GHN when a token is set, but orders get simulated codes and
//             staff simulate status events. Without a token everything is local (development and tests).

export type GhnOrderMode = 'live' | 'simulate';

const env = (name: string) => process.env[name]?.trim() ?? '';
export const ghnToken = () => env('GHN_TOKEN');
export const ghnShopId = () => Number(env('GHN_SHOP_ID')) || 0;
export const ghnConfigured = () => !!ghnToken() && ghnShopId() > 0;
export const ghnBaseUrl = () => (env('GHN_BASE_URL') || 'https://online-gateway.ghn.vn').replace(/\/+$/, '');

export const ghnOrderMode = (): GhnOrderMode => {
  const value = env('GHN_ORDER_MODE') || (ghnConfigured() ? 'live' : 'simulate');
  if (value !== 'live' && value !== 'simulate') throw new Error('GHN_ORDER_MODE must be live or simulate');
  return value;
};

export const assertGhnConfig = () => {
  if (ghnOrderMode() === 'live' && !ghnConfigured())
    throw new Error('GHN_ORDER_MODE=live needs GHN_TOKEN and GHN_SHOP_ID');
  if (env('GHN_SHOP_ID') && !(ghnShopId() > 0)) throw new Error('GHN_SHOP_ID must be a positive integer');
};

// Public tracking page; staging orders (dev-online-gateway) only exist on GHN's staging tracking site.
export const ghnTrackingUrl = (orderCode: string) =>
  `${ghnBaseUrl().includes('dev-online-gateway') ? 'https://tracking.ghn.dev' : 'https://donhang.ghn.vn'}/?order_code=${encodeURIComponent(orderCode)}`;

// GHN's maximum COD and insurance value (create order: cod_amount ≤ 50,000,000; insurance_value ≤ 5,000,000). A shop
// may have lower limits until GHN verifies it (COD_IS_OVER_LIMIT / PRICE_DECLARE_OVER_LIMIT): set GHN_COD_LIMIT_VND and
// GHN_INSURANCE_LIMIT_VND to the shop's actual limits.
export const GHN_MAX_COD_VND = 50_000_000;
export const GHN_MAX_INSURANCE_VND = 5_000_000;
const limit = (name: string, max: number) => {
  const raw = env(name);
  const value = Number(raw);
  return raw && Number.isSafeInteger(value) && value >= 0 ? Math.min(value, max) : max;
};
export const ghnCodLimitVnd = () => limit('GHN_COD_LIMIT_VND', GHN_MAX_COD_VND);
export const ghnInsuranceLimitVnd = () => limit('GHN_INSURANCE_LIMIT_VND', GHN_MAX_INSURANCE_VND);

interface Envelope<T> {
  code: number;
  message: string;
  code_message?: string;
  code_message_value?: string;
  data: T;
}

const call = async <T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  query?: Record<string, string | number>,
): Promise<T> => {
  try {
    return await request<T>(method, path, body, query);
  } catch (error) {
    // GHN (staging especially) answers SERVER_ERR_COMMON now and then: retry read-only calls once.
    const readOnly = method === 'GET' || path.endsWith('/preview');
    if (!(readOnly && error instanceof GhnError && error.ghnCode === 'SERVER_ERR_COMMON')) throw error;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return request<T>(method, path, body, query);
  }
};

const request = async <T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  query?: Record<string, string | number>,
): Promise<T> => {
  if (!ghnConfigured()) throw HttpError.serviceUnavailable('GHN is not configured (GHN_TOKEN, GHN_SHOP_ID).');
  const url = new URL(`${ghnBaseUrl()}${path}`);
  for (const [key, value] of Object.entries(query || {})) url.searchParams.set(key, String(value));
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Token: ghnToken(), ShopId: String(ghnShopId()) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    Logger.ERROR(`GHN ${path} unreachable:`, error);
    throw HttpError.serviceUnavailable('GHN is temporarily unreachable. Please try again.');
  }
  const json = (await response.json().catch(() => ({}))) as Partial<Envelope<T>>;
  if (!response.ok || json.code !== 200) {
    const reason = json.code_message_value || json.message || `HTTP ${response.status}`;
    Logger.WARN(`GHN ${path} refused: ${json.code_message || ''} ${reason}`);
    throw new GhnError(reason, json.code_message || String(response.status), response.status);
  }
  return json.data as T;
};

export class GhnError extends HttpError {
  constructor(
    message: string,
    public ghnCode: string,
    status: number,
  ) {
    super(status >= 500 ? 503 : 409, `GHN: ${message}`, undefined, `GHN_${ghnCode}`);
  }
}

export interface GhnProvince {
  id: number;
  name: string;
  extensionNames: string[];
}
export interface GhnWard {
  id: number;
  name: string;
  extensionNames: string[];
  provinceId: number;
}

// Master data changes rarely: one fetch per day per process.
const DAY_MS = 86_400_000;
let provinceCache: { at: number; rows: GhnProvince[] } | null = null;
const wardCache = new Map<number, { at: number; rows: GhnWard[] }>();

interface RawUnit {
  _id: number;
  name: string;
  extension_names?: string[] | null;
  parent_id: number;
  status: number;
}

export const provinces = async (): Promise<GhnProvince[]> => {
  if (provinceCache && Date.now() - provinceCache.at < DAY_MS) return provinceCache.rows;
  const data =
    (await call<RawUnit[] | null>('GET', '/shiip/public-api/v3/master-data/province/all', undefined, { limit: 200 })) ||
    [];
  const rows = data
    .filter((row) => row.status === 1)
    .map((row) => ({ id: row._id, name: row.name, extensionNames: row.extension_names || [] }));
  rows.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  provinceCache = { at: Date.now(), rows };
  return rows;
};

export const wards = async (provinceId: number): Promise<GhnWard[]> => {
  const cached = wardCache.get(provinceId);
  if (cached && Date.now() - cached.at < DAY_MS) return cached.rows;
  const rows: GhnWard[] = [];
  for (let offset = 0; offset < 2000; offset += 200) {
    const page =
      (await call<RawUnit[] | null>('GET', '/shiip/public-api/v3/master-data/ward/all-by-province-id', undefined, {
        province_id: provinceId,
        offset,
        limit: 200,
      })) || [];
    rows.push(
      ...page
        .filter((row) => row.status === 1)
        .map((row) => ({
          id: row._id,
          name: row.name,
          extensionNames: row.extension_names || [],
          provinceId: row.parent_id,
        })),
    );
    if (page.length < 200) break;
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  wardCache.set(provinceId, { at: Date.now(), rows });
  return rows;
};

export interface GhnParty {
  name: string;
  phone: string;
  address: string;
  wardName: string;
  provinceName: string;
}

export interface GhnOrderInput {
  clientOrderCode: string;
  to: GhnParty;
  from: GhnParty | null; // null: the shop's GHN profile address
  weightGram: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  codAmountVnd: number;
  insuranceValueVnd: number;
  orderValueVnd: number;
  requiredNote: 'KHONGCHOXEMHANG' | 'CHOXEMHANGKHONGTHU' | 'CHOTHUHANG';
  note?: string | null;
  items: { name: string; code?: string; quantity: number; price: number }[];
}

export interface GhnOrderResult {
  orderCode: string;
  totalFeeVnd: number;
  expectedDeliveryTime: string | null;
}

const orderBody = (input: GhnOrderInput) => ({
  payment_type_id: 1,
  required_note: input.requiredNote,
  note: input.note || undefined,
  client_order_code: input.clientOrderCode,
  to_name: input.to.name,
  to_phone: input.to.phone,
  to_address: input.to.address,
  to_ward_name: input.to.wardName,
  to_province_name: input.to.provinceName,
  is_new_to_address: true,
  ...(input.from
    ? {
        from_name: input.from.name,
        from_phone: input.from.phone,
        from_address: input.from.address,
        from_ward_name: input.from.wardName,
        from_province_name: input.from.provinceName,
        is_new_from_address: true,
        return_name: input.from.name,
        return_phone: input.from.phone,
        return_address: input.from.address,
        return_ward_name: input.from.wardName,
        return_province_name: input.from.provinceName,
        is_new_return_address: true,
      }
    : {}),
  cod_amount: input.codAmountVnd,
  insurance_value: Math.min(ghnInsuranceLimitVnd(), input.insuranceValueVnd),
  order_value: input.orderValueVnd,
  weight: input.weightGram,
  length: input.lengthCm,
  width: input.widthCm,
  height: input.heightCm,
  service_type_id: input.weightGram >= 20_000 ? 5 : 2,
  items: input.items.map((item) => ({
    name: item.name.slice(0, 512),
    code: item.code,
    quantity: item.quantity,
    price: item.price,
    ...(input.weightGram >= 20_000
      ? {
          weight: Math.ceil(
            input.weightGram /
              Math.max(
                1,
                input.items.reduce((sum, row) => sum + row.quantity, 0),
              ),
          ),
          length: input.lengthCm,
          width: input.widthCm,
          height: input.heightCm,
        }
      : {}),
  })),
});

interface RawOrder {
  order_code: string;
  total_fee: number;
  expected_delivery_time?: string | null;
}

// A dry run with the create contract: the fee and delivery estimate for checkout, no order is created.
export const previewOrder = async (input: GhnOrderInput): Promise<GhnOrderResult> => {
  const data = await call<RawOrder>('POST', '/shiip/public-api/v2/shipping-order/preview', orderBody(input));
  return { orderCode: '', totalFeeVnd: data.total_fee, expectedDeliveryTime: data.expected_delivery_time || null };
};

// Idempotent by client_order_code: GHN returns the existing order instead of a duplicate.
export const createOrder = async (input: GhnOrderInput): Promise<GhnOrderResult> => {
  const data = await call<RawOrder>('POST', '/shiip/public-api/v2/shipping-order/create', orderBody(input));
  return {
    orderCode: data.order_code,
    totalFeeVnd: data.total_fee,
    expectedDeliveryTime: data.expected_delivery_time || null,
  };
};

export const orderDetail = async (orderCode: string) =>
  call<{
    status: string;
    leadtime?: string | null;
    updated_date?: string | null;
    cod_amount?: number;
    log?: { status: string; updated_date: string }[];
  }>('GET', '/shiip/public-api/v2/shipping-order/detail', undefined, { order_code: orderCode });

export const cancelOrder = async (orderCode: string, reason: string) => {
  const data = await call<{ order_code: string; result: boolean; message: string }[]>(
    'POST',
    '/shiip/public-api/v2/switch-status/cancel',
    {
      order_codes: [orderCode],
      reason_code: 'GHN-CANCEL-OTHER',
      reason: reason.slice(0, 500),
    },
  );
  const row = data?.find((item) => item.order_code === orderCode);
  if (!row?.result)
    throw HttpError.conflict(
      `GHN refused to cancel ${orderCode}: ${row?.message || 'status no longer allows it'}.`,
      'GHN_CANCEL_REFUSED',
    );
};

// A simulated GHN order code (simulate mode): deterministic per request so retries return the same code.
export const simulatedOrderCode = (requestKey: string) =>
  `SIM${crypto.createHash('sha256').update(requestKey).digest('hex').slice(0, 7).toUpperCase()}`;

// GHN order status codes (master data "order-status") as internal statuses.
const STATUS_MAP: Record<string, ShipmentStatus> = {
  ready_to_pick: 'AWAITING_PICKUP',
  picking: 'AWAITING_PICKUP',
  money_collect_picking: 'AWAITING_PICKUP',
  picked: 'PICKED_UP',
  storing: 'IN_TRANSIT',
  sorting: 'IN_TRANSIT',
  transporting: 'IN_TRANSIT',
  delivering: 'OUT_FOR_DELIVERY',
  money_collect_delivering: 'OUT_FOR_DELIVERY',
  delivered: 'DELIVERED',
  delivery_fail: 'DELIVERY_FAILED',
  waiting_to_return: 'RETURNING',
  return: 'RETURNING',
  return_transporting: 'RETURNING',
  return_sorting: 'RETURNING',
  returning: 'RETURNING',
  return_fail: 'RETURNING',
  returned: 'RETURNED',
  cancel: 'CANCELLED',
  exception: 'EXCEPTION',
  lost: 'EXCEPTION',
  damage: 'EXCEPTION',
  scrap: 'EXCEPTION',
};
export const mapGhnStatus = (code: unknown): ShipmentStatus | null =>
  typeof code === 'string' ? (STATUS_MAP[code.trim().toLowerCase()] ?? null) : null;

// GHN does not sign callbacks; it sends the custom header configured in the webhook settings. We require
// `X-Webhook-Token: <GHN_WEBHOOK_TOKEN>` (constant-time compare). Without a configured token the webhook is closed.
export const verifyGhnWebhook = (header: unknown) => {
  const expected = env('GHN_WEBHOOK_TOKEN');
  if (!expected || typeof header !== 'string' || header.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
};
