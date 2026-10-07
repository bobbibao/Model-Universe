import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase, testApp } from './support/testDb';
import request from 'supertest';
import CartService from '../../src/core/server/services/CartService';
import OrderService from '../../src/core/server/services/OrderService';
import CustomerAssistantService from '../../src/core/server/services/CustomerAssistantService';
import ConversionService from '../../src/core/server/services/marketing/ConversionService';
import ProductModel, { STOREFRONT_VISIBLE } from '../../src/core/server/database/client/models/Product.Model';
import ProductDiscountModel from '../../src/core/server/database/client/models/ProductDiscount.Model';
import CouponModel from '../../src/core/server/database/client/models/Coupon.Model';
import OrderModel from '../../src/core/server/database/client/models/Order.Model';
import UserModel from '../../src/core/server/database/internal/models/User.Model';
import { Op } from 'sequelize';
import { makeUser } from '../unit/support/gatewayApp';

describe('customer assistant checkout on a throwaway database', () => {
  let db: Sequelize;
  let product: ProductModel;
  let userId: number;
  let otherUserId: number;
  let orderId: number;
  const couponCode = 'CUSTOMER-STACK';
  beforeAll(async () => {
    process.env.CONVERSIONS_MODE = 'fake';
    jest.spyOn(ConversionService.prototype, 'recordPurchase').mockResolvedValue(undefined as never);
    db = await seedTestDatabase();
    product = (await ProductModel.findOne({
      where: { ...STOREFRONT_VISIBLE, stock: { [Op.gt]: 5 } },
      order: [['id', 'ASC']],
    }))!;
    await product.update({ price: 1000000 });
    await ProductDiscountModel.destroy({ where: { productId: product.id } });
    await ProductDiscountModel.create({
      productId: product.id,
      percent: 30,
      startsAt: new Date(Date.now() - 60000),
      endsAt: new Date(Date.now() + 3600000),
    });
    await CouponModel.create({
      code: couponCode,
      title: 'Test coupon',
      source: 'agent',
      discountPercent: 30,
      usageCount: 0,
      isActive: true,
      minOrderVnd: 0,
      startDate: new Date(0),
      expirationDate: new Date(Date.now() + 3600000),
    });
    const users = await UserModel.findAll({ where: { role: 'USER' }, order: [['id', 'ASC']], limit: 2 });
    [userId, otherUserId] = users.map((u) => u.id);
  }, 600000);
  afterAll(async () => {
    jest.restoreAllMocks();
    await db?.close();
  });
  const items = () => [{ productId: product.id, size: product.availableSizes[0] || '', quantity: 1 }];
  const shipping = { recipientName: 'Khách Test', phone: '0901234567', address: '12 Đường A', city: 'Hồ Chí Minh' };

  it('allows guest cart quotes and requires authentication when quoting a coupon', async () => {
    const app = await testApp('Cart.Controller');
    expect((await request(app).post('/api/cart/quote').send({ items: items() })).status).toBe(200);
    expect((await request(app).post('/api/cart/quote').send({ items: items(), couponCode })).status).toBe(401);
    const quote = await request(app)
      .post('/api/cart/quote')
      .set('x-test-role', 'USER')
      .send({ items: items(), couponCode });
    expect(quote.body).toMatchObject({ subtotal: 700000, discount: 200000, total: 500000 });
  });

  it('uses the same effective discount in the quote and the committed order', async () => {
    const quote = await new CartService().quote(items(), couponCode);
    expect(quote).toMatchObject({ subtotal: 700000, discount: 200000, total: 500000 });
    const stock = product.stock;
    const order = await new OrderService().placeOrder(userId, {
      items: items(),
      shipping,
      couponCode,
      expectedTotal: quote.total,
    });
    orderId = order.id;
    expect(order.total).toBe(quote.total);
    expect((await product.reload()).stock).toBe(stock - 1);
    expect((await CouponModel.findOne({ where: { code: couponCode } }))?.usageCount).toBe(1);
  });

  it('rolls back coupon use and inventory when the reviewed total no longer matches', async () => {
    const stock = product.stock;
    const count = await OrderModel.count();
    await expect(
      new OrderService().placeOrder(userId, { items: items(), shipping, couponCode, expectedTotal: 490000 }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await OrderModel.count()).toBe(count);
    expect((await product.reload()).stock).toBe(stock);
    expect((await CouponModel.findOne({ where: { code: couponCode } }))?.usageCount).toBe(1);
  });

  it('reads public product facts and refuses another customer’s order', async () => {
    const service = new CustomerAssistantService();
    const detail = await service.read(undefined, { kind: 'product_details', productId: product.id }, []);
    expect(detail).not.toHaveProperty('importPrice');
    expect(detail).not.toHaveProperty('supplierId');
    await expect(
      service.read({ ...makeUser('USER'), id: otherUserId }, { kind: 'my_order', orderId, userId }, []),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(await service.read({ ...makeUser('USER'), id: userId }, { kind: 'my_order', orderId }, [])).toMatchObject({
      id: orderId,
      total: 500000,
    });
  });
});
