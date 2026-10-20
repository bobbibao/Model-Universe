import axios from 'axios';
import { inspect } from 'util';
import { decodeJwt } from 'jose';
import { customerPath, parseCustomerAction } from '../../src/shared/customer-assistant-policy';
import CustomerAssistantService, { ASSISTANT_NOTICES } from '../../src/core/server/services/CustomerAssistantService';
import ProductService from '../../src/core/server/services/ProductService';
import ProductDiscountService from '../../src/core/server/services/ProductDiscountService';
import ReviewService from '../../src/core/server/services/ReviewService';
import ProductModel from '../../src/core/server/database/client/models/Product.Model';
import HttpError from '../../src/shared/server/utils/HttpError';
import OrderService from '../../src/core/server/services/OrderService';
import WishlistService from '../../src/core/server/services/WishlistService';
import CartService from '../../src/core/server/services/CartService';
import DatabaseProvider from '../../src/core/server/database/Database.Provider';
import OrderModel from '../../src/core/server/database/client/models/Order.Model';
import CouponModel from '../../src/core/server/database/client/models/Coupon.Model';
import { makeUser } from './support/gatewayApp';

const product = { id: 3, name: 'Giày đi bộ', price: 700000, salePrice: 600000, stock: 4, availableSizes: ['M', 'L'] };
describe('customer assistant boundaries and catalog advice', () => {
  it('rejects navigation to the retired kit comparison page', () => {
    expect(customerPath('/compare')).toBeUndefined();
  });
  beforeEach(() => CustomerAssistantService.resetCaches());
  afterEach(() => jest.restoreAllMocks());
  it('quotes the actual capped Agent coupon discount rather than assuming a percentage of the subtotal', async () => {
    jest.spyOn(CartService.prototype, 'resolveLines').mockResolvedValue({
      lines: [
        {
          productId: 3,
          size: 'M',
          quantity: 1,
          status: 'OK',
          lineTotal: 500000,
          product: { price: 1000000, salePrice: 500000 },
        },
      ],
      products: new Map(),
    } as never);
    jest.spyOn(CouponModel, 'findOne').mockResolvedValue({
      code: 'AGENT25',
      source: 'agent',
      discountPercent: 25,
      isActive: true,
      minOrderVnd: 0,
      startDate: new Date(0),
      expirationDate: new Date(Date.now() + 60000),
      usageLimit: null,
    } as never);
    expect(await new CartService().quote([{ productId: 3, size: 'M', quantity: 1 }], { couponCode: 'AGENT25' })).toMatchObject({
      subtotal: 500000,
      discount: 0,
      total: 500000,
    });
  });
  it('rejects a total changed after preview within the locked checkout transaction', async () => {
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    jest.spyOn(DatabaseProvider, 'getInstance').mockReturnValue({
      transaction: async (callback: (t: unknown) => Promise<unknown>) => callback(transaction),
    } as never);
    jest
      .spyOn(CartService.prototype, 'resolveLines')
      .mockResolvedValue({ lines: [{ status: 'OK', lineTotal: 650000 }], products: new Map() } as never);
    const create = jest.spyOn(OrderModel, 'create');
    await expect(
      new OrderService().placeOrder(7, {
        items: [{ productId: 3, size: 'M', quantity: 1 }],
        shipping: { recipientName: 'Lan', phone: '0901234567', address: '12 Đường A', city: 'Hồ Chí Minh' },
        expectedTotal: 600000,
        paymentPlan: 'deposit',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(create).not.toHaveBeenCalled();
  });
  it.each([
    '/admin',
    '/api/orders',
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    '/auth/signin?redirect=/admin',
    '/shop/product/3/../4',
    '/shop?redirect=https://evil.test',
  ])('denies model navigation %s', (path) => {
    // Normalized product dot segments still resolve to a public product page; never outside the allowlist.
    if (path === '/shop/product/3/../4') expect(customerPath(path)).toBe('/shop/product/4');
    else expect(customerPath(path)).toBeUndefined();
  });
  it('accepts useful public routes and drops unknown write fields', () => {
    expect(customerPath('/shop?brand=Nike&maxPrice=1000000')).toBe('/shop?brand=Nike&maxPrice=1000000');
    expect(customerPath('/cart#checkout')).toBe('/cart#checkout');
    expect(parseCustomerAction({ kind: 'update_profile', firstName: 'Lan', role: 'ADMIN', userId: 100 })).toEqual({
      kind: 'update_profile',
      firstName: 'Lan',
    });
    expect(parseCustomerAction({ kind: 'cart_add', productId: 3, quantity: -1 })).toBeUndefined();
    expect(parseCustomerAction({ kind: 'review', productId: 3, rating: 6 })).toBeUndefined();
    expect(
      parseCustomerAction({
        kind: 'return_request',
        orderId: 5,
        returnItems: [{ orderItemId: 6, quantity: 1, reason: 'not_real' }],
      }),
    ).toBeUndefined();
  });
  it('does not allow guests to query private customer data or select arbitrary tools', async () => {
    const service = new CustomerAssistantService();
    const orders = jest.spyOn(OrderService.prototype, 'listForUser');
    await expect(service.read(undefined, { kind: 'my_orders', userId: 7 }, [])).rejects.toMatchObject({
      statusCode: 401,
    });
    await expect(service.read(undefined, { kind: 'sql', query: 'SELECT *' }, [])).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(orders).not.toHaveBeenCalled();
  });
  it('always binds order queries to the web session, ignoring model-selected user ids', async () => {
    const owned = jest.spyOn(OrderService.prototype, 'getForUser').mockResolvedValue({
      id: 5,
      status: 'DELIVERED',
      total: 200,
      get: () => [],
      address: 'private address',
    } as never);
    const result = await new CustomerAssistantService().read(
      makeUser('USER'),
      { kind: 'my_order', orderId: 5, userId: 100 },
      [],
    );
    expect(owned).toHaveBeenCalledWith(7, 5);
    expect(result).not.toHaveProperty('address');
  });
  it('loops over catalog reads and builds cards from authoritative data, without executing writes', async () => {
    const search = jest
      .spyOn(ProductService.prototype, 'listPublic')
      .mockResolvedValue({ rows: [product], count: 1 } as never);
    jest.spyOn(ProductService.prototype, 'getPublicById').mockResolvedValue(product as never);
    const writes = jest.spyOn(WishlistService.prototype, 'add');
    const service = new CustomerAssistantService();
    const decide = jest
      .spyOn(service, 'decide')
      .mockResolvedValueOnce({ reads: [{ kind: 'search_products', q: 'giày', maxPrice: 1000000 }] })
      .mockResolvedValueOnce({ reads: [{ kind: 'product_details', productId: 3 }] })
      .mockResolvedValueOnce({
        answer: 'Giá đang bán 600.000đ.',
        productIds: [3, 999],
        products: [{ id: 999, salePrice: 1 }],
        actions: [
          { kind: 'wishlist_add', productId: 3, size: 'M' },
          { kind: 'navigate', path: '/admin' },
        ],
      });
    const reply = await service.chat(makeUser('USER'), {
      message: 'Nghiên cứu giày và lưu yêu thích',
      research: true,
      history: [],
      cart: [],
    });
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ maxPrice: 1000000, limit: 8 }));
    expect(decide.mock.calls[2][1].observations).toEqual(
      expect.arrayContaining([expect.objectContaining({ tool: { kind: 'product_details', productId: 3 } })]),
    );
    expect(decide.mock.calls[0][1].research).toBe(false);
    expect(reply.research).toBe(false);
    expect(reply.products).toEqual([product]);
    expect(reply.actions).toHaveLength(1);
    expect(reply.sources).toEqual([{ label: product.name, path: '/shop/product/3' }]);
    expect(writes).not.toHaveBeenCalled();
  });
  it('never lets the answer claim a dropped or unconfirmed action happened', async () => {
    jest.spyOn(ProductService.prototype, 'getPublicById').mockResolvedValue(product as never);
    const service = new CustomerAssistantService();
    jest.spyOn(service, 'decide').mockResolvedValue({
      answer: 'Đã gửi yêu cầu trả hàng.',
      actions: [{ kind: 'return_request', orderId: 885, returnItems: [{}] }],
    });
    const dropped = await service.chat(makeUser('USER'), { message: 'Trả hàng đơn 885' });
    expect(dropped.actions).toEqual([]);
    expect(dropped.answer).toContain(ASSISTANT_NOTICES.vi.dropped);
    expect(dropped.answer).not.toContain(ASSISTANT_NOTICES.vi.pending);

    jest.spyOn(service, 'decide').mockResolvedValue({
      answer: 'Added to your bag.',
      actions: [{ kind: 'cart_add', productId: 3, size: '', quantity: 1 }],
    });
    const pending = await service.chat(makeUser('USER'), { message: 'Add it', locale: 'en' });
    expect(pending.actions).toHaveLength(1);
    expect(pending.answer).toBe(`Added to your bag.\n\n${ASSISTANT_NOTICES.en.pending}`);

    jest.spyOn(service, 'decide').mockResolvedValue({ answer: 'Xin chào' });
    expect((await service.chat(undefined, { message: 'Chào' })).answer).toBe('Xin chào');
  });
  it('treats a review eligibility read of a non-product id as not found, not as not purchased', async () => {
    jest.spyOn(ProductService.prototype, 'getPublicById').mockRejectedValue(HttpError.notFound('Không tìm thấy sản phẩm.'));
    const eligibility = jest.spyOn(ReviewService.prototype, 'getEligibility');
    await expect(
      new CustomerAssistantService().read(makeUser('USER'), { kind: 'review_eligibility', productId: 885 }, []),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(eligibility).not.toHaveBeenCalled();
  });
  it('offers a review card only when the server would accept the review', async () => {
    jest.spyOn(ProductService.prototype, 'getPublicById').mockResolvedValue(product as never);
    const eligibility = jest.spyOn(ReviewService.prototype, 'getEligibility');
    const service = new CustomerAssistantService();
    jest.spyOn(service, 'decide').mockResolvedValue({
      answer: 'Bản nháp đánh giá',
      actions: [{ kind: 'review', productId: 3, rating: 4, content: 'Khớp chắc' }],
    });
    eligibility.mockResolvedValueOnce({ canReview: false, reason: 'Bạn đã đánh giá sản phẩm này.' } as never);
    const refused = await service.chat(makeUser('USER'), { message: 'Đánh giá' });
    expect(refused.actions).toEqual([]);
    expect(refused.answer).toContain(ASSISTANT_NOTICES.vi.dropped);
    eligibility.mockResolvedValueOnce({ canReview: true } as never);
    expect((await service.chat(makeUser('USER'), { message: 'Đánh giá' })).actions).toHaveLength(1);
  });
  it('searches every word of the query in any order', async () => {
    const find = jest.spyOn(ProductModel, 'findAndCountAll').mockResolvedValue({ rows: [], count: 0 } as never);
    jest.spyOn(ProductDiscountService.prototype, 'withPricing').mockResolvedValue([] as never);
    await new ProductService().listPublic({ q: 'Dynames — custom 100%', limit: 8, offset: 0 });
    const where = inspect(find.mock.calls[0][0]!.where, { depth: null }); // Sequelize operators are symbol keys
    expect(where).toContain('%Dynames%');
    expect(where).toContain('%custom%');
    expect(where).toContain('%100%');
    expect(where).not.toContain('Dynames — custom');
  });
  it('drops cancellation proposals for an order outside the current account', async () => {
    jest.spyOn(OrderService.prototype, 'getForUser').mockRejectedValue(new Error('not owned'));
    const service = new CustomerAssistantService();
    jest
      .spyOn(service, 'decide')
      .mockResolvedValue({ answer: 'Đề xuất', actions: [{ kind: 'cancel_order', orderId: 99 }] });
    expect((await service.chat(makeUser('USER'), { message: 'Hủy đơn 99' })).actions).toEqual([]);
  });
  it('uses only the customer graph and customer token even for an admin shopping', async () => {
    process.env.AGENT_ACTOR_SECRET = 'customer-test-secret-0123456789abcdef';
    process.env.AGENT_SERVER_URL = 'http://agent.test';
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: { decision: { answer: 'Xin chào' } } });
    await new CustomerAssistantService().chat(makeUser(), {
      message: 'Chào bạn',
      assistant_id: 'improvement',
      thread_id: 'admin-thread',
      role: 'owner',
    });
    expect(post.mock.calls[0][0]).toBe('http://agent.test/runs/wait');
    expect(post.mock.calls[0][1]).toMatchObject({ assistant_id: 'customer_assistant' });
    const token = (post.mock.calls[0][2]?.headers as Record<string, string>).Authorization.split(' ')[1];
    expect(decodeJwt(token)).toMatchObject({ role: 'customer', sub: 'user:7' });
  });
  it('ends repeated reads instead of looping indefinitely', async () => {
    jest.spyOn(ProductService.prototype, 'listPublic').mockResolvedValue({ rows: [], count: 0 } as never);
    const service = new CustomerAssistantService();
    const decide = jest
      .spyOn(service, 'decide')
      .mockResolvedValue({ reads: [{ kind: 'search_products', q: 'missing' }], answer: 'Không tìm thấy' });
    await service.chat(undefined, { message: 'Tìm món không có' });
    expect(decide).toHaveBeenCalledTimes(3);
    expect(decide.mock.calls[2][1]).toHaveProperty('readsAllowed', false);
  });
  it('cancels an upstream stream even if it keeps receiving heartbeat data', async () => {
    const post = jest.spyOn(axios, 'post').mockImplementation((_url, _body, config) => new Promise((_resolve, reject) => {
      const signal = config!.signal as AbortSignal;
      signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
    }));
    await expect(new CustomerAssistantService().chat(undefined, { message: 'Find a Gunpla kit' }, AbortSignal.timeout(20)))
      .rejects.toMatchObject({ statusCode: 503 });
    expect(post).toHaveBeenCalledTimes(1);
    expect((post.mock.calls[0][2]!.signal as AbortSignal).aborted).toBe(true);
  });

  it('does not call the model when the client has already disconnected', async () => {
    const post = jest.spyOn(axios, 'post').mockRejectedValue(new Error('must not be called'));
    const controller = new AbortController(); controller.abort();
    await expect(new CustomerAssistantService().chat(undefined, { message: 'Find a Gunpla kit' }, controller.signal))
      .rejects.toMatchObject({ statusCode: 503 });
    expect(post).not.toHaveBeenCalled();
  });

  it('does not perform reads or offer mutations after cancellation while planning', async () => {
    const controller = new AbortController();
    const service = new CustomerAssistantService();
    jest.spyOn(service, 'decide').mockImplementation(async () => {
      controller.abort();
      return { answer: 'Draft', reads: [{ kind: 'search_products', q: 'Gundam' }], actions: [{ kind: 'cart_clear' }] };
    });
    const read = jest.spyOn(service, 'read');
    await expect(service.chat(undefined, { message: 'Find a Gunpla kit' }, controller.signal))
      .rejects.toMatchObject({ statusCode: 503 });
    expect(read).not.toHaveBeenCalled();
  });


  it('sends products once as catalog facts and refers to them by id in observations', async () => {
    jest.spyOn(ProductService.prototype, 'listPublic').mockResolvedValue({ rows: [product], count: 1 } as never);
    const service = new CustomerAssistantService();
    const decide = jest
      .spyOn(service, 'decide')
      .mockResolvedValueOnce({ reads: [{ kind: 'search_products', q: 'giày' }], route: { intent: 'search', confidence: 0.9 } })
      .mockResolvedValueOnce({ answer: 'Có 1 mẫu.', productIds: [3] });
    await service.chat(undefined, { message: 'Tìm giày', cart: [] });
    const second = decide.mock.calls[1][1] as Record<string, any>;
    expect(second.observations).toEqual([
      { tool: { kind: 'search_products', q: 'giày' }, data: { count: 1, page: 1, productIds: [3] } },
    ]);
    expect(second.catalog).toEqual([expect.objectContaining({ id: 3, name: product.name, salePrice: 600000 })]);
    // The route the planner returned is echoed back, so later rounds are not classified again.
    expect(second.route).toEqual({ intent: 'search', confidence: 0.9 });
  });
  it('shares public catalog reads across turns and never caches private reads', async () => {
    const search = jest.spyOn(ProductService.prototype, 'listPublic').mockResolvedValue({ rows: [], count: 0 } as never);
    const orders = jest.spyOn(OrderService.prototype, 'listForUser').mockResolvedValue({ rows: [], count: 0 } as never);
    const service = new CustomerAssistantService();
    const read = { kind: 'search_products', q: 'zaku' };
    await service.read(undefined, read, []);
    await service.read(undefined, { ...read }, []);
    expect(search).toHaveBeenCalledTimes(1);
    await service.read(makeUser('USER'), { kind: 'my_orders' }, []);
    await service.read(makeUser('USER'), { kind: 'my_orders' }, []);
    expect(orders).toHaveBeenCalledTimes(2);
  });
  it('answers repeated first questions of guests from one planner run', async () => {
    const service = new CustomerAssistantService();
    let finish: (value: Record<string, unknown>) => void = () => undefined;
    const decide = jest
      .spyOn(service, 'decide')
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
      .mockResolvedValue({ answer: 'Có, cửa hàng giao toàn quốc.' });
    const first = service.chat(undefined, { message: 'Shop có giao hàng toàn quốc không?' });
    const concurrent = service.chat(undefined, { message: '  shop có giao hàng toàn quốc không ' });
    await new Promise((resolve) => setImmediate(resolve));
    finish({ answer: 'Có, cửa hàng giao toàn quốc.' });
    expect((await first).answer).toBe('Có, cửa hàng giao toàn quốc.');
    expect((await concurrent).answer).toBe('Có, cửa hàng giao toàn quốc.');
    expect((await service.chat(undefined, { message: 'Shop có giao hàng toàn quốc không?' })).answer).toBe(
      'Có, cửa hàng giao toàn quốc.',
    );
    expect(decide).toHaveBeenCalledTimes(1);
    // Signed-in shoppers, conversations and non-empty bags always get their own run.
    await service.chat(makeUser('USER'), { message: 'Shop có giao hàng toàn quốc không?' });
    await service.chat(undefined, { message: 'Shop có giao hàng toàn quốc không?', history: [{ role: 'user', text: 'Chào' }] });
    expect(decide).toHaveBeenCalledTimes(3);
  });
  it('reports progress while it reads', async () => {
    jest.spyOn(ProductService.prototype, 'listPublic').mockResolvedValue({ rows: [], count: 0 } as never);
    const service = new CustomerAssistantService();
    jest
      .spyOn(service, 'decide')
      .mockResolvedValueOnce({ reads: [{ kind: 'search_products', q: 'rx' }] })
      .mockResolvedValueOnce({ answer: 'Không có.' });
    const steps: unknown[] = [];
    await service.chat(makeUser('USER'), { message: 'Tìm RX' }, undefined, (step) => steps.push(step));
    expect(steps).toEqual([{ step: 'thinking' }, { step: 'read', kind: 'search_products' }, { step: 'analyzing' }]);
  });
});
