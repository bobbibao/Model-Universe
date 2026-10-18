import {
  createOrder,
  mapSuperAiStatus,
  price,
  simulatedOrderCode,
  superAiOrderMode,
  verifySuperAiWebhook,
  type CreateOrderInput,
} from '../../src/core/server/services/delivery/SuperAiClient';
import { splitAddress } from '../../src/core/server/services/delivery/OpenMapClient';
import { cheapestCarrier, estimateDays, type CarrierQuote } from '../../src/shared/fulfillment';
import { productPath, slugify } from '../../src/shared/slug';

// SuperAI client contract (https://docs.superai.vn): the Token header, the price comparison, the order body (chosen
// carrier, shop-paid fee, COD), refusals in an HTTP 200 envelope, status mapping and the webhook token.
describe('SuperAI client', () => {
  let calls: { url: string; init: RequestInit }[] = [];
  let reply: unknown;
  beforeEach(() => {
    calls = [];
    Object.assign(process.env, { SUPERAI_TOKEN: 'token-1', SUPERAI_BASE_URL: '', SUPERAI_ORDER_MODE: '' });
    global.fetch = jest.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init || {} });
      return new Response(JSON.stringify(reply), { status: 200 });
    }) as typeof fetch;
  });

  it('is in simulate mode unless live is chosen explicitly (SuperAI has no sandbox)', () => {
    expect(superAiOrderMode()).toBe('simulate');
    process.env.SUPERAI_ORDER_MODE = 'live';
    expect(superAiOrderMode()).toBe('live');
    process.env.SUPERAI_ORDER_MODE = 'staging';
    expect(() => superAiOrderMode()).toThrow();
  });

  it('quotes every carrier with the Token header, rounding fees to whole VND', async () => {
    reply = {
      error: false,
      message: '',
      data: {
        services: [
          {
            carrier_id: 2,
            carrier_name: 'GHN',
            shipment_fee: 19000,
            insurance_fee: 0,
            estimated_delivery: 'Khoảng 2.1 - 2.6 ngày',
          },
          {
            carrier_id: 10,
            carrier_name: 'SPX Express',
            shipment_fee: 14000,
            insurance_fee: 2500.4,
            estimated_delivery: 'Khoảng 2.4 - 2.9 ngày',
          },
        ],
      },
    };
    const quotes = await price({
      senderProvince: 'Thành phố Hồ Chí Minh',
      senderDistrict: 'Quận Gò Vấp',
      receiverProvince: 'Thành phố Hà Nội',
      receiverDistrict: 'Quận Hoàn Kiếm',
      weightGram: 3600,
      valueVnd: 499_000,
    });
    expect(calls[0].url).toBe('https://api.superai.vn/v1/platform/orders/price');
    expect(calls[0].init.headers).toMatchObject({ Token: 'token-1', Accept: 'application/json' });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      sender_province: 'Thành phố Hồ Chí Minh',
      sender_district: 'Quận Gò Vấp',
      receiver_province: 'Thành phố Hà Nội',
      receiver_district: 'Quận Hoàn Kiếm',
      weight: 3600,
      value: 499_000,
    });
    expect(quotes[1]).toMatchObject({ carrierId: 10, shipmentFeeVnd: 14000, insuranceFeeVnd: 2500, feeVnd: 16500 });
  });

  it('creates the order with the chosen carrier, the shop paying the fee, and the remaining balance as COD', async () => {
    reply = {
      error: false,
      message: '',
      data: {
        carrier_id: '10',
        carrier_name: 'SPX Express',
        carrier_code: null,
        superai_code: 'HUGS983262NM.810002159',
        superai_shortcode: '810002159',
        fee: 14000,
        insurance: 0,
        status: '2',
      },
    };
    const input: CreateOrderInput = {
      pickupCode: 'W03UZZEXEB',
      carrierId: 10,
      name: 'Nguyễn Văn A',
      phone: '0901234567',
      address: '1 Đinh Tiên Hoàng',
      province: 'Thành phố Hà Nội',
      district: 'Quận Hoàn Kiếm',
      commune: 'Phường Hàng Bạc',
      codAmountVnd: 449_100,
      valueVnd: 499_000,
      weightGram: 3600,
      soc: 'MU901',
      note: 'Hàng dễ vỡ',
      config: '1',
      products: [{ sku: '48', name: 'Model kit', price: 499_000, weight: 3600, quantity: 1 }],
    };
    const created = await createOrder(input);
    expect(created).toMatchObject({
      superaiCode: 'HUGS983262NM.810002159',
      carrierId: 10,
      carrierCode: null,
      feeVnd: 14000,
    });
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      pickup_code: 'W03UZZEXEB',
      carrier: '10',
      amount: 449_100,
      value: 499_000,
      payer: '1',
      service: '1',
      product_type: '2',
      soc: 'MU901',
      commune: 'Phường Hàng Bạc',
    });
  });

  it('turns a refusal in the HTTP 200 envelope into a conflict', async () => {
    reply = { error: true, message: 'Quận/Huyện (Giao Hàng) chưa đúng, vui lòng kiểm tra lại.', data: [] };
    await expect(
      price({
        senderProvince: 'a',
        senderDistrict: 'b',
        receiverProvince: 'c',
        receiverDistrict: 'd',
        weightGram: 1,
        valueVnd: 0,
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'SUPERAI_REFUSED' });
  });

  it.each([
    ['2', 'AWAITING_PICKUP'],
    ['4', 'PICKED_UP'],
    ['23', 'IN_TRANSIT'],
    ['11', 'OUT_FOR_DELIVERY'],
    ['12', 'DELIVERED'],
    ['14', 'DELIVERY_FAILED'],
    ['20', 'RETURNING'],
    ['21', 'RETURNED'],
    ['0', 'CANCELLED'],
    ['25', 'EXCEPTION'],
    [6, 'EXCEPTION'],
  ])('maps SuperAI status %s to %s', (code, status) => {
    expect(mapSuperAiStatus(code)).toBe(status);
  });

  it('closes the webhook without a token and compares it exactly', () => {
    delete process.env.SUPERAI_WEBHOOK_TOKEN;
    expect(verifySuperAiWebhook('anything')).toBe(false);
    process.env.SUPERAI_WEBHOOK_TOKEN = 'secret-token';
    expect(verifySuperAiWebhook('secret-token')).toBe(true);
    expect(verifySuperAiWebhook('secret-tokeX')).toBe(false);
    expect(verifySuperAiWebhook(undefined)).toBe(false);
  });

  it('simulates deterministic codes per request', () => {
    expect(simulatedOrderCode('auto-1-200000')).toBe(simulatedOrderCode('auto-1-200000'));
    expect(simulatedOrderCode('auto-1-200000')).toMatch(/^SIM[0-9A-F]{9}$/);
  });
});

describe('cheapest carrier', () => {
  const quote = (carrierId: number, feeVnd: number, estimatedDelivery: string | null): CarrierQuote => ({
    carrierId,
    carrierName: `C${carrierId}`,
    shipmentFeeVnd: feeVnd,
    insuranceFeeVnd: 0,
    feeVnd,
    estimatedPickup: null,
    estimatedDelivery,
  });

  it('takes the lowest fee including insurance, then the faster estimate, then the lower id', () => {
    expect(cheapestCarrier([quote(2, 19000, null), quote(10, 14000, null), quote(3, 18000, null)])?.carrierId).toBe(10);
    expect(
      cheapestCarrier([quote(6, 18000, 'Khoảng 2.5 - 3.0 ngày'), quote(3, 18000, 'Khoảng 2.4 - 2.9 ngày')])?.carrierId,
    ).toBe(3);
    expect(cheapestCarrier([quote(6, 18000, null), quote(3, 18000, null)])?.carrierId).toBe(3);
    expect(cheapestCarrier([quote(2, 0, null)])).toBeNull();
    expect(estimateDays('Khoảng 2.1 - 2.6 ngày')).toBe(2.6);
  });
});

describe('Openmap address parts', () => {
  it('splits street, ward, district and province (three-level names)', () => {
    expect(splitAddress('Vincom, 72 Lê Thánh Tôn, phường Bến Nghé, quận 1, thành phố Hồ Chí Minh'.split(','))).toEqual({
      street: 'Vincom, 72 Lê Thánh Tôn',
      ward: 'phường Bến Nghé',
      district: 'quận 1',
      province: 'thành phố Hồ Chí Minh',
    });
    expect(splitAddress('12 Đường 3, xã Bình Hưng, huyện Bình Chánh, thành phố Hồ Chí Minh'.split(','))).toMatchObject({
      ward: 'xã Bình Hưng',
      district: 'huyện Bình Chánh',
    });
    expect(splitAddress('Hồ Xuân Hương, phường 9, thành phố Đà Lạt, tỉnh Lâm Đồng'.split(','))).toMatchObject({
      district: 'thành phố Đà Lạt',
      province: 'tỉnh Lâm Đồng',
    });
  });
});

describe('SEO slugs', () => {
  it('turns Vietnamese names into accent-free paths', () => {
    expect(slugify('Motor Nuclear BV-XH01A Xiang Yu / Hạng Vũ — Bản A')).toBe('motor-nuclear-bv-xh01a-xiang-yu-hang-vu-ban-a');
    expect(slugify('Đồ chơi Gundam 1/144 · Đỏ')).toBe('do-choi-gundam-1-144-do');
    expect(productPath({ id: 7, slug: 'rx-78-2' })).toBe('/san-pham/rx-78-2');
    expect(productPath({ id: 7 })).toBe('/shop/product/7');
  });
});
