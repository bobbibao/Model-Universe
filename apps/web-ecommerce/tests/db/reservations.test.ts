import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase, testApp } from './support/testDb';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { Op } from 'sequelize';
import ReservationService from '../../src/core/server/services/ReservationService';
import CommercePolicyService from '../../src/core/server/services/CommercePolicyService';
import OrderService from '../../src/core/server/services/OrderService';
import ConversionService from '../../src/core/server/services/marketing/ConversionService';
import ProductModel from '../../src/core/server/database/client/models/Product.Model';
import ProductDiscountModel from '../../src/core/server/database/client/models/ProductDiscount.Model';
import ReservationModel from '../../src/core/server/database/client/models/Reservation.Model';
import ReservationPaymentModel from '../../src/core/server/database/client/models/ReservationPayment.Model';
import UserModel from '../../src/core/server/database/internal/models/User.Model';
import EvidenceService from '../../src/core/server/services/EvidenceService';
import ReservationReminderService from '../../src/core/server/services/ReservationReminderService';
import CommerceNotificationModel from '../../src/core/server/database/client/models/CommerceNotification.Model';

describe('reservation transactions on a disposable database', () => {
  let db: Sequelize, product: ProductModel, userId: number, otherId: number, adminId: number;
  const service = new ReservationService();
  const shipping = { recipientName: 'Test Collector', phone: '0901234567', address: '12 Test Street', city: 'Test City' };
  const create = (key: string) => service.create(userId, { productId: product.id, quantity: 1, expectedTotal: 1000000, requestKey: key });
  const payment = (id: number, key: string, amountVnd = 500000) => service.confirmPayment(id, adminId, { amountVnd, externalReference: key, reason: 'Fixture receipt verified', moneyVerified: true });
  beforeAll(async () => {
    jest.spyOn(ConversionService.prototype, 'recordPurchase').mockResolvedValue(undefined as never);
    db = await seedTestDatabase();
    product = (await ProductModel.findOne({ where: { stock: { [Op.gt]: 5 } } }))!;
    await product.update({ price: 1000000, grade: 'RG' });
    await ProductDiscountModel.destroy({ where: { productId: product.id } });
    const users = await UserModel.findAll({ where: { role: 'USER' }, order: [['id','ASC']], limit: 2 });
    [userId, otherId] = users.map(user => user.id);
    adminId = (await UserModel.findOne({ where: { role: 'ADMIN', isActive: true } }))!.id;
  }, 600000);
  afterAll(async () => { jest.restoreAllMocks(); await db?.close(); });

  it('requires a recorded policy approval and rejects stale competing approval', async () => {
    await expect(create('policy-test-request')).rejects.toMatchObject({ statusCode: 409 });
    const policies = new CommercePolicyService();
    const settings = { priceBasis: 'net_merchandise', dayCutoff: 'elapsed_24h', extensionMode: 'additive' };
    await policies.approve('reservation', settings, 0, adminId, 'Test fixture only; not a production approval');
    await expect(policies.approve('reservation', settings, 0, adminId, 'Stale fixture')).rejects.toMatchObject({ statusCode: 409 });
  });
  it('allocates stock once on a verified deposit and makes bank references globally unique', async () => {
    const row = await create('deposit-test-request'), stock = (await product.reload()).stock;
    await expect(service.confirmPayment(row.id, userId, { amountVnd: 500000, externalReference: 'bank-test-one', reason: 'Not staff', moneyVerified: true })).rejects.toMatchObject({ statusCode: 403 });
    await expect(payment(row.id, 'bank-test-low', 499999)).rejects.toMatchObject({ statusCode: 400 });
    const confirmed = await payment(row.id, 'bank-test-one');
    await payment(row.id, 'bank-test-one');
    expect((await product.reload()).stock).toBe(stock - 1);
    expect(confirmed.paidVnd).toBe(500000);
    expect(await ReservationPaymentModel.count({ where: { reservationId: row.id } })).toBe(1);
    const another = await create('deposit-test-another');
    await expect(payment(another.id, 'bank-test-one')).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.detail(row.id, otherId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(payment(row.id, 'bank-test-over', 500001)).rejects.toMatchObject({ statusCode: 400 });
  });
  it('adds time from the first confirmation and keeps expired inventory allocated', async () => {
    const row = await create('deadline-test-request');
    const first = await payment(row.id, 'bank-deadline-initial');
    const next = await payment(row.id, 'bank-deadline-topup', 20000);
    expect(next.expiresAt?.getTime()).toBe(first.expiresAt?.getTime());
    const extended = await service.extend(row.id, adminId, { days: 2, reason: 'Explicit fixture extension' });
    expect(extended.expiresAt!.getTime() - first.expiresAt!.getTime()).toBe(2 * 86400000);
    const stock = (await product.reload()).stock;
    await ReservationModel.update({ expiresAt: new Date(Date.now() - 1000) }, { where: { id: row.id } });
    await expect(payment(row.id, 'bank-expired-topup', 30000)).rejects.toMatchObject({ statusCode: 409 });
    expect((await service.expiryQueue()).map(item => item.id)).toContain(row.id);
    expect((await product.reload()).stock).toBe(stock);
  });
  it('transfers allocation to COD, returns cancelled fulfillment to the same hold, then completes it', async () => {
    const row = await create('fulfill-test-request');
    const stock = (await product.reload()).stock;
    await payment(row.id, 'bank-fulfill-initial');
    await service.requestDelivery(row.id, userId, { deliveryMethod: 'delivery', shipping });
    const confirmed = await service.confirmDelivery(row.id, adminId);
    await service.confirmDelivery(row.id, adminId);
    const order = await new OrderService().getForUser(userId, confirmed.orderId!);
    expect(order).toMatchObject({ total: 1000000, prepaidVnd: 500000, paymentStatus: 'PENDING' });
    expect((await product.reload()).stock).toBe(stock - 1);
    await new OrderService().cancelForUser(userId, order.id);
    const held = await service.detail(row.id, userId);
    expect(held).toMatchObject({ status: 'holding', paidVnd: 500000, inventoryAllocated: true, orderId: null });
    expect((await product.reload()).stock).toBe(stock - 1);
    await service.requestDelivery(row.id, userId, { deliveryMethod: 'delivery', shipping });
    await payment(row.id, 'bank-fulfill-complete');
    expect((await service.detail(row.id)).status).toBe('delivery_requested');
    const second = await service.confirmDelivery(row.id, adminId);
    await new OrderService().updateStatus(second.orderId!, 'SHIPPED', adminId);
    await new OrderService().updateStatus(second.orderId!, 'DELIVERED', adminId);
    expect((await service.detail(row.id)).status).toBe('completed');
  });
  it('releases a cancelled allocation exactly once and limits executed refunds to liability', async () => {
    const row = await create('refund-test-request'), stock = (await product.reload()).stock;
    await payment(row.id, 'bank-refund-initial');
    await service.cancel(row.id, adminId, { reason: 'Documented shop fault' });
    await service.cancel(row.id, adminId, { reason: 'Retry' });
    expect((await product.reload()).stock).toBe(stock);
    const data = { amountVnd: 500000, externalReference: 'bank-refund-executed', moneyVerified: true, exceptionReason: 'shop_fault', reason: 'Executed shop-fault refund' };
    await service.confirmRefund(row.id, adminId, data);
    await service.confirmRefund(row.id, adminId, data);
    await expect(service.confirmRefund(row.id, adminId, { ...data, externalReference: 'bank-refund-excess' })).rejects.toMatchObject({ statusCode: 400 });
    expect(await ReservationPaymentModel.count({ where: { reservationId: row.id, kind: 'refund' } })).toBe(1);
  });
  it('keeps uploaded evidence private and never treats a photograph as money', async () => {
    process.env.PRIVATE_UPLOAD_DIR = path.resolve('../../.artifacts/model-universe/test-evidence');
    const app = await testApp('Evidence.Controller');
    const photograph = fs.readFileSync(path.resolve('public/images/catalog/rg-zaku-ii-box.webp'));
    expect((await request(app).post('/api/evidence').field('purpose','reservation_payment').attach('file',photograph,{filename:'deposit.webp',contentType:'image/webp'})).status).toBe(401);
    const uploaded = await request(app).post('/api/evidence').set('x-test-role','USER').field('purpose','reservation_payment').attach('file',photograph,{filename:'deposit.webp',contentType:'image/webp'});
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.data).not.toHaveProperty('diskKey');
    const id = uploaded.body.data.id;
    expect((await request(app).get(`/api/evidence/${id}`).set('x-test-role','USER')).headers['cache-control']).toBe('private, no-store');
    await expect(new EvidenceService().read(id,{id:otherId,role:'USER'},{} as never)).rejects.toMatchObject({statusCode:404});
    const row = await service.create(7,{productId:product.id,quantity:1,expectedTotal:1000000,requestKey:'evidence-test-request'});
    await service.attachEvidence(row.id,7,[id]);
    expect((await service.detail(row.id,7)).paidVnd).toBe(0);
    await expect(service.attachEvidence(row.id,7,[id + 99999])).rejects.toMatchObject({statusCode:404});
    const bad = await request(app).post('/api/evidence').set('x-test-role','USER').field('purpose','reservation_payment').attach('file',Buffer.from('<svg><script>evil</script></svg>'),{filename:'fake.webp',contentType:'image/webp'});
    expect(bad.status).toBe(400);
  });
  it('persists one reminder per threshold and rejects ledger edits even through raw SQL', async () => {
    const row = await create('reminder-test-request');
    await payment(row.id,'bank-reminder-initial');
    const now = new Date();
    await ReservationModel.update({expiresAt:new Date(now.getTime() + 2 * 86400000)}, {where:{id:row.id}});
    const reminders = new ReservationReminderService();
    await reminders.run(now); await reminders.run(now);
    expect(await CommerceNotificationModel.count({where:{entityId:row.id}})).toBe(1);
    await reminders.run(new Date(now.getTime() + 86400000));
    expect(await CommerceNotificationModel.count({where:{entityId:row.id}})).toBe(2);
    await expect(db.query(`UPDATE reservation_payment SET "amountVnd" = 1 WHERE "reservationId" = ${row.id}`)).rejects.toThrow('append-only');
    await expect(db.query('DELETE FROM commerce_policy')).rejects.toThrow('append-only');
  });
  it('allows exactly one winner when checkout races a confirmed hold for the last model', async () => {
    await product.update({ stock: 1 });
    const row = await create('race-test-request');
    const outcomes = await Promise.allSettled([
      payment(row.id, 'bank-race-initial'),
      new OrderService().placeOrder(otherId, { items: [{ productId: product.id, quantity: 1, size: '' }], shipping, expectedTotal: 1000000 }),
    ]);
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((await product.reload()).stock).toBe(0);
  });
});
