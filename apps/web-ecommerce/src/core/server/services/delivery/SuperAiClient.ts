import crypto from 'crypto';
import HttpError from '../../../../shared/server/utils/HttpError';
import Logger from '../../../../shared/server/utils/logger';
import type { CarrierQuote, ShipmentStatus } from '../../../../shared/fulfillment';

// SuperAI (https://docs.superai.vn): one API in front of several carriers (GHN, J&T, Viettel Post, BEST, SPX,
// VNPost...). `orders/price` quotes every carrier for a route; `orders/create` with `carrier` books the chosen one.
// Areas are SuperAI's three-level units (province → district → commune) and are public; everything else sends the
// static API token as the `Token` header. Credentials are web-only: SUPERAI_TOKEN.
// SuperAI has no sandbox, so SUPERAI_ORDER_MODE decides whether orders are real:
//   simulate (default) quotes and areas come from SuperAI, but waybills get simulated codes and staff simulate events.
//   live               creates real SuperAI orders (a carrier comes to pick up) and cancels them through the API.

export type SuperAiOrderMode = 'live' | 'simulate';

const env = (name: string) => process.env[name]?.trim() ?? '';
export const superAiToken = () => env('SUPERAI_TOKEN');
export const superAiConfigured = () => !!superAiToken();
export const superAiBaseUrl = () => (env('SUPERAI_BASE_URL') || 'https://api.superai.vn').replace(/\/+$/, '');

export const superAiOrderMode = (): SuperAiOrderMode => {
  const value = env('SUPERAI_ORDER_MODE') || 'simulate';
  if (value !== 'live' && value !== 'simulate') throw new Error('SUPERAI_ORDER_MODE must be live or simulate');
  return value;
};

export const assertSuperAiConfig = () => {
  if (superAiOrderMode() === 'live' && !superAiConfigured())
    throw new Error('SUPERAI_ORDER_MODE=live needs SUPERAI_TOKEN');
};

// The most the carrier collects on delivery (SHIPPING_COD_LIMIT_VND, default 50,000,000): checkout asks for a larger
// upfront payment above it.
export const shippingCodLimitVnd = () => {
  const raw = env('SHIPPING_COD_LIMIT_VND');
  const value = Number(raw);
  return raw && Number.isSafeInteger(value) && value >= 0 ? value : 50_000_000;
};

interface Envelope<T> {
  error: boolean;
  message: string;
  data: T;
}

export class SuperAiError extends HttpError {
  constructor(message: string, status: number) {
    super(status >= 500 ? 503 : 409, `SuperAI: ${message}`, undefined, 'SUPERAI_REFUSED');
  }
}

const request = async <T>(method: 'GET' | 'POST', path: string, body?: unknown, auth = true): Promise<T> => {
  if (auth && !superAiConfigured()) throw HttpError.serviceUnavailable('SuperAI is not configured (SUPERAI_TOKEN).');
  let response: Response;
  try {
    response = await fetch(`${superAiBaseUrl()}/v1/platform${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(auth ? { Token: superAiToken() } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    Logger.ERROR(`SuperAI ${path} unreachable:`, error);
    throw HttpError.serviceUnavailable('SuperAI is temporarily unreachable. Please try again.');
  }
  const json = (await response.json().catch(() => ({}))) as Partial<Envelope<T>>;
  // SuperAI answers HTTP 200 with `error: true` for refused requests.
  if (!response.ok || json.error !== false) {
    const reason = json.message || `HTTP ${response.status}`;
    Logger.WARN(`SuperAI ${path} refused: ${reason}`);
    throw new SuperAiError(reason, response.status >= 500 ? response.status : 409);
  }
  return json.data as T;
};

// Read-only calls are retried once when SuperAI is unreachable or answers a server error.
const read = async <T>(method: 'GET' | 'POST', path: string, body?: unknown, auth = true): Promise<T> => {
  try {
    return await request<T>(method, path, body, auth);
  } catch (error) {
    if (!(error instanceof HttpError) || error.statusCode !== 503) throw error;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return request<T>(method, path, body, auth);
  }
};

export interface AreaUnit {
  code: string;
  name: string;
}

// Area master data changes rarely: one fetch per day per process.
const DAY_MS = 86_400_000;
const areaCache = new Map<string, { at: number; rows: AreaUnit[] }>();
const cachedAreas = async (key: string, path: string) => {
  const hit = areaCache.get(key);
  if (hit && Date.now() - hit.at < DAY_MS) return hit.rows;
  const rows = ((await read<AreaUnit[] | null>('GET', path, undefined, false)) || [])
    .map((row) => ({ code: String(row.code), name: String(row.name).trim() }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  areaCache.set(key, { at: Date.now(), rows });
  return rows;
};
export const provinces = () => cachedAreas('provinces', '/areas/province');
export const districts = (provinceCode: string) =>
  cachedAreas(`districts:${provinceCode}`, `/areas/district?province=${encodeURIComponent(provinceCode)}`);
export const communes = (districtCode: string) =>
  cachedAreas(`communes:${districtCode}`, `/areas/commune?district=${encodeURIComponent(districtCode)}`);

export interface PriceInput {
  senderProvince: string;
  senderDistrict: string;
  receiverProvince: string;
  receiverDistrict: string;
  weightGram: number;
  valueVnd: number;
}

// Every connected carrier's price for the route, weight and declared value (nothing is created).
export const price = async (input: PriceInput): Promise<CarrierQuote[]> => {
  const data = await read<{
    services?: {
      carrier_id: number;
      carrier_name: string;
      shipment_fee: number;
      insurance_fee: number;
      estimated_pickup?: string | null;
      estimated_delivery?: string | null;
    }[];
  }>('POST', '/orders/price', {
    sender_province: input.senderProvince,
    sender_district: input.senderDistrict,
    receiver_province: input.receiverProvince,
    receiver_district: input.receiverDistrict,
    weight: Math.max(1, Math.round(input.weightGram)),
    value: Math.max(0, Math.round(input.valueVnd)),
  });
  return (data?.services || []).map((row) => {
    const shipmentFeeVnd = Math.round(Number(row.shipment_fee) || 0),
      insuranceFeeVnd = Math.round(Number(row.insurance_fee) || 0);
    return {
      carrierId: Number(row.carrier_id),
      carrierName: String(row.carrier_name),
      shipmentFeeVnd,
      insuranceFeeVnd,
      feeVnd: shipmentFeeVnd + insuranceFeeVnd,
      estimatedPickup: row.estimated_pickup || null,
      estimatedDelivery: row.estimated_delivery || null,
    };
  });
};

export interface SuperAiWarehouse {
  code: string;
  name: string;
  phone: string | null;
  contact: string | null;
  address: string;
  formattedAddress: string;
  communeName: string;
  districtName: string;
  provinceName: string;
  active: boolean;
  primary: boolean;
}

export const warehouses = async (): Promise<SuperAiWarehouse[]> => {
  const data = await read<{ warehouses?: Record<string, string | null>[] }>('GET', '/warehouses');
  return (data?.warehouses || []).map((row) => ({
    code: String(row.code),
    name: String(row.name || row.code),
    phone: row.phone || null,
    contact: row.contact || null,
    address: String(row.address || ''),
    formattedAddress: String(row.formatted_address || row.address || ''),
    communeName: String(row.commune_name || ''),
    districtName: String(row.district_name || ''),
    provinceName: String(row.province_name || ''),
    active: String(row.status) === '1',
    primary: String(row.primary) === '1',
  }));
};

export interface CreateOrderInput {
  pickupCode: string;
  carrierId: number;
  name: string;
  phone: string;
  address: string;
  province: string;
  district: string;
  commune: string;
  codAmountVnd: number;
  valueVnd: number;
  weightGram: number;
  soc: string; // the shop's own order code (idempotency on SuperAI's side is not documented; we never resend)
  note: string;
  config: '1' | '2' | '3'; // 1 view but no try, 2 try, 3 no viewing
  products: { sku: string; name: string; price: number; weight: number; quantity: number }[];
}

export interface CreatedOrder {
  superaiCode: string;
  shortCode: string | null;
  carrierId: number;
  carrierName: string;
  carrierCode: string | null; // may be null for a few minutes until the carrier accepts it
  feeVnd: number;
  insuranceVnd: number;
  status: string;
}

export const createOrder = async (input: CreateOrderInput): Promise<CreatedOrder> => {
  const data = await request<Record<string, string | number | null>>('POST', '/orders/create', {
    pickup_code: input.pickupCode,
    carrier: String(input.carrierId),
    name: input.name,
    phone: input.phone,
    address: input.address,
    province: input.province,
    district: input.district,
    commune: input.commune,
    amount: input.codAmountVnd,
    value: input.valueVnd,
    weight: Math.max(1, Math.round(input.weightGram)),
    soc: input.soc,
    note: input.note.slice(0, 500),
    service: '1',
    config: input.config,
    payer: '1', // the shop pays the carrier: the customer already paid the fee in the order total
    product_type: '2',
    products: input.products,
  });
  return {
    superaiCode: String(data.superai_code),
    shortCode: data.superai_shortcode ? String(data.superai_shortcode) : null,
    carrierId: Number(data.carrier_id) || input.carrierId,
    carrierName: String(data.carrier_name || ''),
    carrierCode: data.carrier_code ? String(data.carrier_code) : null,
    feeVnd: Math.round(Number(data.fee) || 0),
    insuranceVnd: Math.round(Number(data.insurance) || 0),
    status: String(data.status ?? '2'),
  };
};

export interface OrderInfo {
  superaiCode: string;
  carrierId: number;
  carrierName: string;
  carrierCode: string | null;
  status: string;
  statusName: string;
  updatedAt: string | null;
}

export const orderInfo = async (superaiCode: string): Promise<OrderInfo> => {
  const data = await read<{ order?: Record<string, string | null> }>(
    'GET',
    `/orders/info?code=${encodeURIComponent(superaiCode)}&type=1`,
  );
  const order = data?.order || {};
  return {
    superaiCode: String(order.superai_code || superaiCode),
    carrierId: Number(order.carrier_id) || 0,
    carrierName: String(order.carrier_name || ''),
    carrierCode: order.carrier_code ? String(order.carrier_code) : null,
    status: String(order.status ?? ''),
    statusName: String(order.status_name || ''),
    updatedAt: order.updated_at || null,
  };
};

export const cancelOrder = async (superaiCode: string) => {
  await request('POST', '/orders/cancel', { code: superaiCode });
};

export const webhookInfo = async () => {
  const data = await read<{ webhook_url?: string; updated_at?: string } | unknown[]>('GET', '/webhooks/info');
  return !data || Array.isArray(data) ? null : { url: data.webhook_url || null, updatedAt: data.updated_at || null };
};

export const registerWebhook = async (url: string) => {
  const data = await request<{ webhook_url?: string }>('POST', '/webhooks/register', { webhook_url: url });
  return { url: data?.webhook_url || url };
};

// A simulated SuperAI order (simulate mode): deterministic per request so retries return the same code.
export const simulatedOrderCode = (requestKey: string) =>
  `SIM${crypto.createHash('sha256').update(requestKey).digest('hex').slice(0, 9).toUpperCase()}`;

// SuperAI status codes (docs "Thông Tin Thêm → Trạng Thái Đơn Hàng") as internal statuses.
const STATUS_MAP: Record<string, ShipmentStatus> = {
  '1': 'CREATED', // Chờ Duyệt
  '2': 'AWAITING_PICKUP', // Chờ Lấy Hàng
  '3': 'AWAITING_PICKUP', // Đang Lấy Hàng
  '4': 'PICKED_UP', // Đã Lấy Hàng
  '5': 'AWAITING_PICKUP', // Hoãn Lấy Hàng
  '6': 'EXCEPTION', // Không Lấy Được
  '7': 'IN_TRANSIT', // Đang Nhập Kho
  '8': 'IN_TRANSIT', // Đã Nhập Kho
  '9': 'IN_TRANSIT', // Đang Chuyển Kho Giao
  '10': 'IN_TRANSIT', // Đã Chuyển Kho Giao
  '23': 'IN_TRANSIT', // Đang Vận Chuyển
  '11': 'OUT_FOR_DELIVERY', // Đang Giao Hàng
  '12': 'DELIVERED', // Đã Giao Hàng Toàn Bộ
  '16': 'DELIVERED', // Đã Đối Soát Giao Hàng
  '13': 'EXCEPTION', // Đã Giao Hàng Một Phần: staff check what came back
  '14': 'DELIVERY_FAILED', // Hoãn Giao Hàng
  '15': 'DELIVERY_FAILED', // Không Giao Được
  '24': 'RETURNING', // Xác Nhận Hoàn
  '18': 'RETURNING', // Đang Chuyển Kho Trả
  '19': 'RETURNING', // Đã Chuyển Kho Trả
  '20': 'RETURNING', // Đang Trả Hàng
  '22': 'RETURNING', // Hoãn Trả Hàng
  '21': 'RETURNED', // Đã Trả Hàng
  '17': 'RETURNED', // Đã Đối Soát Trả Hàng
  '26': 'EXCEPTION', // Không Trả Được
  '25': 'EXCEPTION', // Hàng Thất Lạc
  '27': 'EXCEPTION', // Đã Bồi Hoàn
  '0': 'CANCELLED', // Huỷ
};
export const mapSuperAiStatus = (code: unknown): ShipmentStatus | null =>
  code === null || code === undefined ? null : (STATUS_MAP[String(code).trim()] ?? null);

// SuperAI does not sign callbacks; the registered URL carries `?token=<SUPERAI_WEBHOOK_TOKEN>` (constant-time
// compare). Without a configured token the webhook is closed.
export const verifySuperAiWebhook = (token: unknown) => {
  const expected = env('SUPERAI_WEBHOOK_TOKEN');
  if (!expected || typeof token !== 'string' || token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
};

// Public tracking pages of the carriers (SuperAI carrier ids); VNPost has no deep link, so its parcels are followed on
// the shop's own order page.
const TRACKING: Record<number, (code: string) => string> = {
  2: (code) => `https://donhang.ghn.vn/?order_code=${encodeURIComponent(code)}`,
  3: (code) => `https://jtexpress.vn/vi/tracking?type=track&billcode=${encodeURIComponent(code)}`,
  4: (code) => `https://viettelpost.vn/thong-tin-don-hang?peopleTracking=sender&orderNumber=${encodeURIComponent(code)}`,
  6: (code) => `https://best-inc.vn/track?bills=${encodeURIComponent(code)}`,
  10: (code) => `https://spx.vn/track?${encodeURIComponent(code)}`,
};
export const carrierTrackingUrl = (carrierId: number, carrierCode: string | null) =>
  carrierCode && TRACKING[carrierId] ? TRACKING[carrierId](carrierCode) : null;
