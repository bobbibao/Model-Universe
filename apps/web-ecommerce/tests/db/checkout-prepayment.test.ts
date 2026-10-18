import { Op } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase } from './support/testDb';
import OrderService from '../../src/core/server/services/OrderService';
import ConversionService from '../../src/core/server/services/marketing/ConversionService';
import ProductModel from '../../src/core/server/database/client/models/Product.Model';
import ProductDiscountModel from '../../src/core/server/database/client/models/ProductDiscount.Model';
import UserModel from '../../src/core/server/database/internal/models/User.Model';
import OrderPrepaymentModel from '../../src/core/server/database/client/models/OrderPrepayment.Model';

// Owner rule 2026-10-11: every new order is paid upfront by bank transfer, as a deposit of at least 10% or in full,
// and ships only after staff verify the transfer.
describe('checkout deposit or full payment on disposable PostgreSQL', () => {
  let db: Sequelize, product: ProductModel, adminId: number, userId: number;
  let key = 0;
  let codReference = '';
  const orders = new OrderService();
  const shipping = {
    recipientName: 'Fixture Collector',
    phone: '0901234567',
    address: '12 Fixture Road',
    city: 'Fixture City',
  };
  const place = (extra: Record<string, unknown>) =>
    orders.placeOrder(userId, {
      items: [{ productId: product.id, quantity: 1, size: '' }],
      shipping,
      requestKey: `prepayment-${++key}-${Date.now()}`,
      ...extra,
    });
  const transfer = (
    orderId: number,
    kind: 'receipt' | 'refund',
    amountVnd: number,
    reference: string,
    actor = adminId,
  ) =>
    orders.recordPrepayment(orderId, actor, {
      kind,
      amountVnd,
      externalReference: reference,
      reason: 'Fixture verified bank transaction',
      moneyVerified: true,
    });

  beforeAll(async () => {
    jest.spyOn(ConversionService.prototype, 'recordPurchase').mockResolvedValue(undefined as never);
    db = await seedTestDatabase();
    product = (await ProductModel.findOne({
      where: { stock: { [Op.gt]: 2 }, condition: 'new', isArchived: false, partnerId: null },
      order: [['id', 'ASC']],
    }))!;
    await product.update({ price: 1280000, stock: 50, inventoryStatus: 'available' });
    await ProductDiscountModel.destroy({ where: { productId: product.id } });
    userId = (await UserModel.findOne({ where: { role: 'USER' }, order: [['id', 'ASC']] }))!.id;
    adminId = (await UserModel.findOne({ where: { role: 'ADMIN', isActive: true } }))!.id;
  }, 600_000);
  afterAll(() => db.close());

  it('requires a payment plan and either the 10% deposit or the full amount', async () => {
    await expect(place({})).rejects.toMatchObject({ statusCode: 400, code: 'PAYMENT_PLAN_REQUIRED' });
    await expect(place({ paymentPlan: 'cod' })).rejects.toMatchObject({ code: 'PAYMENT_PLAN_REQUIRED' });
    await expect(place({ paymentPlan: 'deposit', depositVnd: 127999 })).rejects.toMatchObject({
      code: 'DEPOSIT_INVALID',
    });
    await expect(place({ paymentPlan: 'deposit', depositVnd: 1280001 })).rejects.toMatchObject({
      code: 'DEPOSIT_INVALID',
    });
    await expect(place({ paymentPlan: 'deposit', depositVnd: 384000 })).rejects.toMatchObject({
      code: 'DEPOSIT_INVALID',
    });
    const deposit = await place({ paymentPlan: 'deposit', depositVnd: 128000 });
    expect(deposit).toMatchObject({
      paymentPlan: 'deposit',
      upfrontDueVnd: 128000,
      prepaidVnd: 0,
      paymentSource: 'TRANSFER_PLUS_COD',
    });
    const full = await place({ paymentPlan: 'full' });
    expect(full).toMatchObject({ paymentPlan: 'full', upfrontDueVnd: 1280000, paymentSource: 'BANK_TRANSFER' });
    expect(full.get('transferInstructions')).toMatchObject({ amountVnd: 1280000, memo: `MU${full.id}` });
  });

  it('ships a deposit order only after the verified transfer, then collects only the balance', async () => {
    const order = await place({ paymentPlan: 'deposit' });
    expect(order.upfrontDueVnd).toBe(128000);
    await expect(orders.updateStatus(order.id, 'SHIPPED', adminId)).rejects.toMatchObject({
      code: 'PREPAYMENT_REQUIRED',
    });
    await expect(transfer(order.id, 'receipt', 128000, `DEPOSIT-USER-${order.id}`, userId)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(transfer(order.id, 'receipt', 127999, `DEPOSIT-LOW-${order.id}`)).rejects.toMatchObject({
      code: 'PREPAYMENT_AMOUNT',
    });
    await expect(transfer(order.id, 'refund', 128000, `DEPOSIT-EARLY-REFUND-${order.id}`)).rejects.toMatchObject({
      statusCode: 409,
    });
    const paid = await transfer(order.id, 'receipt', 128000, `DEPOSIT-OK-${order.id}`);
    expect(paid).toMatchObject({ prepaidVnd: 128000, paymentStatus: 'PENDING', requiresCollectionConfirmation: true });
    expect(paid.get('transferInstructions')).toBeNull();
    // Replaying the same bank reference is idempotent; a second receipt is refused.
    await transfer(order.id, 'receipt', 128000, `DEPOSIT-OK-${order.id}`);
    await expect(transfer(order.id, 'receipt', 128000, `DEPOSIT-AGAIN-${order.id}`)).rejects.toMatchObject({
      statusCode: 409,
    });
    await orders.updateStatus(order.id, 'SHIPPED', adminId);
    await orders.updateStatus(order.id, 'DELIVERED', adminId);
    codReference = `DEPOSIT-COD-${order.id}`;
    const collect = { externalReference: codReference, reason: 'Fixture courier remittance', moneyVerified: true };
    await expect(orders.confirmCollection(order.id, adminId, { ...collect, amountVnd: 1280000 })).rejects.toMatchObject(
      { statusCode: 409 },
    );
    const settled = await orders.confirmCollection(order.id, adminId, { ...collect, amountVnd: 1152000 });
    expect(settled.paymentStatus).toBe('PAID');
  });

  it('settles a full transfer before shipping with nothing left to collect', async () => {
    const order = await place({ paymentPlan: 'full' });
    const paid = await transfer(order.id, 'receipt', 1280000, `FULL-OK-${order.id}`);
    expect(paid).toMatchObject({ prepaidVnd: 1280000, paymentStatus: 'PAID', requiresCollectionConfirmation: false });
    await orders.updateStatus(order.id, 'SHIPPED', adminId);
    const delivered = await orders.updateStatus(order.id, 'DELIVERED', adminId);
    expect(delivered.paymentStatus).toBe('PAID');
  });

  it('lets customers cancel only before paying, and refunds a cancelled prepaid order exactly once', async () => {
    const unpaid = await place({ paymentPlan: 'deposit' });
    await expect(orders.cancelForUser(userId, unpaid.id, {})).rejects.toMatchObject({ code: 'CANCEL_REASON_REQUIRED' });
    await expect(orders.cancelForUser(userId, unpaid.id, { reason: 'other', note: 'short' })).rejects.toMatchObject({
      code: 'CANCEL_REASON_REQUIRED',
    });
    const cancelled = await orders.cancelForUser(userId, unpaid.id, { reason: 'changed_mind' });
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancelReason: 'changed_mind', cancelledBy: 'customer' });
    const order = await place({ paymentPlan: 'deposit' });
    await transfer(order.id, 'receipt', 640000, `REFUND-IN-${order.id}`);
    // Paid: the customer's cancellation is a request for the shop (refund); a second one waits for the first.
    const requested = await orders.cancelForUser(userId, order.id, { reason: 'found_better_price' });
    expect(requested).toMatchObject({ status: 'PROCESSING', cancelRequest: { status: 'PENDING', reason: 'found_better_price' } });
    await expect(orders.cancelForUser(userId, order.id, { reason: 'changed_mind' })).rejects.toMatchObject({
      code: 'CANCEL_REQUEST_PENDING',
    });
    // Staff cancel only with a staff reason; approving the request records it.
    await expect(orders.updateStatus(order.id, 'CANCELLED', adminId)).rejects.toMatchObject({ code: 'CANCEL_REASON_REQUIRED' });
    const approved = await orders.updateStatus(order.id, 'CANCELLED', adminId, { reason: 'customer_request' });
    expect(approved).toMatchObject({ cancelledBy: 'staff', cancelReason: 'customer_request', cancelRequest: { status: 'APPROVED' } });
    await expect(transfer(order.id, 'refund', 600000, `REFUND-OUT-LOW-${order.id}`)).rejects.toMatchObject({
      code: 'PREPAYMENT_AMOUNT',
    });
    // The incoming transfer's bank reference cannot be reused for the refund (one reference, one money event).
    await expect(transfer(order.id, 'refund', 640000, `REFUND-IN-${order.id}`)).rejects.toMatchObject({
      statusCode: 409,
    });
    const refunded = await transfer(order.id, 'refund', 640000, `REFUND-OUT-${order.id}`);
    expect((refunded.get('prepayments') as OrderPrepaymentModel[]).map((row) => row.kind)).toEqual([
      'receipt',
      'refund',
    ]);
    await expect(transfer(order.id, 'refund', 640000, `REFUND-OUT-AGAIN-${order.id}`)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('keeps the prepayment ledger append-only and its references unique across money ledgers', async () => {
    await expect(db.query('UPDATE order_prepayment SET "amountVnd" = 1')).rejects.toThrow(/append-only/i);
    await expect(db.query('DELETE FROM order_prepayment')).rejects.toThrow(/append-only/i);
    const order = await place({ paymentPlan: 'deposit' });
    // A COD remittance reference from order_receipt cannot be recorded again as a prepayment.
    await expect(transfer(order.id, 'receipt', 128000, codReference)).rejects.toMatchObject({ statusCode: 409 });
  });
});
