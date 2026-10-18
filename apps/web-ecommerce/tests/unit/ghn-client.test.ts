import {
  createOrder,
  ghnOrderMode,
  mapGhnStatus,
  previewOrder,
  provinces,
  verifyGhnWebhook,
  type GhnOrderInput,
} from '../../src/core/server/services/delivery/GhnClient';
import { znsPhone } from '../../src/core/server/services/delivery/ZaloClient';

// GHN client contract (https://developer.ghn.vn/vi/docs): headers, two-level address fields, idempotent client code,
// status mapping and the webhook token. No network: fetch is replaced.
describe('GHN client', () => {
  const input: GhnOrderInput = {
    clientOrderCode: 'MU42',
    to: {
      name: 'Khách',
      phone: '0901234567',
      address: '12 Lê Lợi, Phường Bến Thành, Hồ Chí Minh',
      wardName: 'Phường Bến Thành',
      provinceName: 'Hồ Chí Minh',
    },
    from: {
      name: 'MODEL universe',
      phone: '0912345678',
      address: '1 Nguyễn Huệ',
      wardName: 'Phường Sài Gòn',
      provinceName: 'Hồ Chí Minh',
    },
    weightGram: 1200,
    lengthCm: 40,
    widthCm: 30,
    heightCm: 15,
    codAmountVnd: 1_800_000,
    insuranceValueVnd: 9_000_000,
    orderValueVnd: 2_000_000,
    requiredNote: 'CHOXEMHANGKHONGTHU',
    items: [{ name: 'RX-78-2', code: '7', quantity: 1, price: 2_000_000 }],
  };
  let calls: { url: string; init: RequestInit }[] = [];
  beforeEach(() => {
    calls = [];
    Object.assign(process.env, {
      GHN_TOKEN: 'token-1',
      GHN_SHOP_ID: '6732229',
      GHN_BASE_URL: 'https://dev-online-gateway.ghn.vn',
      GHN_ORDER_MODE: '',
    });
    global.fetch = jest.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init || {} });
      const path = new URL(String(url)).pathname;
      const data = path.endsWith('/province/all')
        ? [
            { _id: 202, name: 'Hồ Chí Minh', extension_names: ['TP.HCM'], parent_id: 1, status: 1 },
            { _id: 9, name: 'Cũ', parent_id: 1, status: 2 },
          ]
        : {
            order_code: path.endsWith('/create') ? 'LADFYR' : '',
            total_fee: 20900,
            expected_delivery_time: '2026-10-20T16:59:59Z',
          };
      return new Response(JSON.stringify({ code: 200, message: 'Success', data }), { status: 200 });
    }) as typeof fetch;
  });

  it('creates with Token/ShopId headers, the new address model, shop-paid fee and the client order code', async () => {
    expect(ghnOrderMode()).toBe('live');
    const result = await createOrder(input);
    expect(result).toEqual({ orderCode: 'LADFYR', totalFeeVnd: 20900, expectedDeliveryTime: '2026-10-20T16:59:59Z' });
    const call = calls[0];
    expect(call.url).toBe('https://dev-online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create');
    expect(call.init.headers).toMatchObject({ Token: 'token-1', ShopId: '6732229' });
    const body = JSON.parse(String(call.init.body));
    expect(body).toMatchObject({
      payment_type_id: 1,
      client_order_code: 'MU42',
      is_new_to_address: true,
      is_new_from_address: true,
      to_ward_name: 'Phường Bến Thành',
      to_province_name: 'Hồ Chí Minh',
      cod_amount: 1_800_000,
      insurance_value: 5_000_000, // GHN's maximum
      service_type_id: 2,
    });
    expect(body).not.toHaveProperty('to_district_name');
  });

  it('quotes with the dry-run preview endpoint', async () => {
    expect((await previewOrder(input)).totalFeeVnd).toBe(20900);
    expect(calls[0].url).toContain('/v2/shipping-order/preview');
  });

  it('keeps only active provinces', async () => {
    expect(await provinces()).toEqual([{ id: 202, name: 'Hồ Chí Minh', extensionNames: ['TP.HCM'] }]);
  });

  it('turns a GHN refusal into a conflict with its code', async () => {
    global.fetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 400,
            message: 'Bad',
            code_message: 'PHONE_INVALID',
            code_message_value: 'Số điện thoại không hợp lệ',
          }),
          { status: 400 },
        ),
    ) as typeof fetch;
    await expect(createOrder(input)).rejects.toMatchObject({ statusCode: 409, code: 'GHN_PHONE_INVALID' });
  });

  it.each([
    ['ready_to_pick', 'AWAITING_PICKUP'],
    ['picked', 'PICKED_UP'],
    ['transporting', 'IN_TRANSIT'],
    ['delivering', 'OUT_FOR_DELIVERY'],
    ['delivered', 'DELIVERED'],
    ['delivery_fail', 'DELIVERY_FAILED'],
    ['returned', 'RETURNED'],
    ['lost', 'EXCEPTION'],
    ['cancel', 'CANCELLED'],
  ])('maps %s to %s', (code, status) => {
    expect(mapGhnStatus(code)).toBe(status);
  });

  it('accepts the webhook only with the configured token', () => {
    delete process.env.GHN_WEBHOOK_TOKEN;
    expect(verifyGhnWebhook('anything')).toBe(false);
    process.env.GHN_WEBHOOK_TOKEN = 'secret-token';
    expect(verifyGhnWebhook('secret-token')).toBe(true);
    expect(verifyGhnWebhook('secret-tokeX')).toBe(false);
    expect(verifyGhnWebhook(undefined)).toBe(false);
  });

  it('normalizes phone numbers for Zalo ZNS', () => {
    expect(znsPhone('0901 234 567')).toBe('84901234567');
    expect(znsPhone('+84901234567')).toBe('84901234567');
    expect(znsPhone('0241234567')).toBeNull();
  });
});
