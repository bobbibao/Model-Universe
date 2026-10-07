import axios from 'axios';
import { decodeJwt } from 'jose';
import { customerPath, parseCustomerAction } from '../../src/shared/customer-assistant-policy';
import CustomerAssistantService from '../../src/core/server/services/CustomerAssistantService';
import ProductService from '../../src/core/server/services/ProductService';
import OrderService from '../../src/core/server/services/OrderService';
import WishlistService from '../../src/core/server/services/WishlistService';
import CartService from '../../src/core/server/services/CartService';
import DatabaseProvider from '../../src/core/server/database/Database.Provider';
import OrderModel from '../../src/core/server/database/client/models/Order.Model';
import CouponModel from '../../src/core/server/database/client/models/Coupon.Model';
import { makeUser } from './support/gatewayApp';

const product = { id: 3, name: 'Giày đi bộ', price: 700000, salePrice: 600000, stock: 4, availableSizes: ['M', 'L'] };
describe('customer assistant boundaries and research', () => {
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
    expect(await new CartService().quote([{ productId: 3, size: 'M', quantity: 1 }], 'AGENT25')).toMatchObject({
      subtotal: 500000,
      discount: 0,
      total: 500000,
      couponCode: 'AGENT25',
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
    expect(reply.products).toEqual([product]);
    expect(reply.actions).toHaveLength(1);
    expect(reply.sources).toEqual([{ label: product.name, path: '/shop/product/3' }]);
    expect(writes).not.toHaveBeenCalled();
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
});
