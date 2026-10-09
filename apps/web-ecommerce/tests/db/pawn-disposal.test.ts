import crypto from 'crypto';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase } from './support/testDb';
import PawnDisposalService from '../../src/core/server/services/PawnDisposalService';
import PawnService from '../../src/core/server/services/PawnService';
import OrderService from '../../src/core/server/services/OrderService';
import LoyaltyService from '../../src/core/server/services/LoyaltyService';
import EvidenceService from '../../src/core/server/services/EvidenceService';
import PawnContractModel from '../../src/core/server/database/client/models/PawnContract.Model';
import PawnDisposalEntryModel from '../../src/core/server/database/client/models/PawnDisposalEntry.Model';
import PawnEventModel from '../../src/core/server/database/client/models/PawnEvent.Model';
import OrderItemModel from '../../src/core/server/database/client/models/OrderItem.Model';
import OrderRefundModel from '../../src/core/server/database/client/models/OrderRefund.Model';
import ReturnRequestModel from '../../src/core/server/database/client/models/ReturnRequest.Model';
import ProductModel from '../../src/core/server/database/client/models/Product.Model';
import EvidenceModel from '../../src/core/server/database/client/models/Evidence.Model';
import UserModel from '../../src/core/server/database/internal/models/User.Model';
import { PAWN_DAY_MS } from '../../src/shared/pawn-rules';
import type { PawnDisposalStatement } from '../../src/shared/types/pawn-disposal';

describe('signed post-disposal accounting against actual source collection', () => {
  let db: Sequelize, ownerId: number, buyerId: number, otherId: number, adminId: number, original: Record<string, unknown>;
  const service = new PawnDisposalService(), pawn = new PawnService(), orders = new OrderService();
  const shipping = { recipientName: 'Synthetic source buyer', phone: '0901234567', address: 'Disposable fixture address', city: 'Ho Chi Minh City' };
  const asset = { name: 'Disposed source fixture', modelCode: 'DISPOSAL-FIXTURE', version: 'Actual inspected edition', assemblyState: 'painted', boxCondition: 'No box', accessories: 'Stand', defects: 'Paint wear', repairHistory: 'Custom paint' };
  const photo = (userId: number) => EvidenceModel.create({ ownerUserId: userId, purpose: 'pawn_settlement', diskKey: `${crypto.randomUUID()}.webp`, originalName: 'Synthetic statement or expense fixture.webp', mimeType: 'image/webp', sizeBytes: 100, sha256: crypto.randomBytes(32).toString('hex') });
  const fixture = async (price = 1800000, collect = true, mixed = false) => {
    const product = await ProductModel.create({ ...original, id: undefined, sku: `DISPOSAL-${crypto.randomUUID()}`, name: asset.name, modelCode: asset.modelCode, price, stock: 1, sold: 0, condition: 'preowned', assemblyState: 'painted', partnerId: null, isArchived: false, isFeatured: false, inventoryStatus: 'available', listingStatus: 'published' });
    const row = await PawnContractModel.create({ userId: ownerId, requestKey: crypto.randomUUID(), requestDigest: crypto.randomBytes(32).toString('hex'), asset,
      status: 'disposed', version: 0, productId: product.id, disposedAt: new Date(Date.now() - PAWN_DAY_MS),
      disbursedAt: new Date(Date.now() - 35 * PAWN_DAY_MS), dueAt: new Date(Date.now() - 5 * PAWN_DAY_MS),
      contractReference: crypto.randomUUID(), custodyAt: new Date(Date.now() - 36 * PAWN_DAY_MS), custodyReference: crypto.randomUUID(),
      terms: { appraisalVnd: 2000000, principalVnd: 1400000, termDays: 30, disposalAfterGrace: true, contractText: 'Explicit synthetic previously signed contract fixture; separate amendment required.', policyVersion: 1,
        policy: { dailyRateBasisPoints: 3, dayCount: 'completed_days', rounding: 'ceil', graceDays: 2, interestStopEvent: 'asset_handback' } } });
    const items = [{ productId: product.id, quantity: 1, size: '' }];
    if (mixed) {
      const extra = await ProductModel.create({ ...original, id: undefined, sku: crypto.randomUUID(), name: 'Other unrelated order model', price: 1000000, stock: 2, sold: 0, condition: 'new', partnerId: null, isArchived: false, inventoryStatus: 'available' });
      items.push({ productId: extra.id, quantity: 1, size: '' });
    }
    const order = await orders.placeOrder(buyerId, { shipping, items, requestKey: crypto.randomUUID() });
    await orders.updateStatus(order.id, 'SHIPPED', adminId); await orders.updateStatus(order.id, 'DELIVERED', adminId);
    if (collect) await orders.confirmCollection(order.id, adminId, { amountVnd: order.total, externalReference: `DISPOSAL-SALE-${row.id}`, moneyVerified: true, reason: 'Synthetic verified source remittance' });
    const line = (await OrderItemModel.findOne({ where: { orderId: order.id, productId: product.id } }))!;
    return { row, order, line };
  };
  const offer = async (row: PawnContractModel, lineId: number, costs: { description: string; amountVnd: number; evidenceId: number }[] = []) => {
    await service.offer(row.id, adminId, { expectedVersion: (await row.reload()).version, orderItemId: lineId, costs,
      agreementText: 'Explicit synthetic D6 signed amendment: documented accepted expenses, principal, interest, customer surplus; shortfall remains debt; full payment stops interest; no implicit debt waiver.' });
    return row.reload();
  };
  const accept = async (row: PawnContractModel) => {
    await service.decide(row.id, ownerId, { expectedVersion: (await row.reload()).version, decision: 'accept', termsAccepted: true, costsAccepted: true, evidenceIds: [(await photo(ownerId)).id], bankName: 'Synthetic bank', accountNumber: 'TEST-ONLY-ACCOUNT', holderName: 'Synthetic fixture collector' });
    return row.reload();
  };
  const execute = async (row: PawnContractModel) => {
    await service.execute(row.id, adminId, { expectedVersion: (await row.reload()).version, bilateralSignatureVerified: true, amendmentReference: `DISPOSAL-AMENDMENT-${row.id}-${row.version}` });
    return row.reload();
  };
  beforeAll(async () => {
    db = await seedTestDatabase();
    [ownerId, buyerId, otherId] = (await UserModel.findAll({ where: { role: 'USER', isActive: true }, order: [['id', 'ASC']], limit: 3 })).map(user => user.id);
    adminId = (await UserModel.findOne({ where: { role: 'ADMIN', isActive: true } }))!.id;
    original = (await ProductModel.findOne({ where: { condition: 'new', isArchived: false } }))!.get({ plain: true });
  }, 600000);
  afterAll(async () => { await db?.close(); });

  it('requires actual collection, ownership and exact current customer consent', async () => {
    const { row, line } = await fixture(1800000, false);
    await expect(offer(row, line.id)).rejects.toMatchObject({ statusCode: 409, code: 'PAWN_SALE_UNCOLLECTED' });
    await orders.confirmCollection(line.orderId, adminId, { amountVnd: 1800000, externalReference: `DISPOSAL-SALE-${row.id}`, moneyVerified: true, reason: 'Synthetic source receipt' });
    await offer(row, line.id);
    await expect(service.decide(row.id, otherId, { expectedVersion: row.version, decision: 'accept' })).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.offer(row.id, ownerId, { expectedVersion: row.version, orderItemId: line.id, costs: [], agreementText: 'Unauthorized fixture' })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.decide(row.id, ownerId, { expectedVersion: row.version - 1, decision: 'accept', termsAccepted: true, costsAccepted: true })).rejects.toMatchObject({ statusCode: 409 });
    await expect(execute(row)).rejects.toMatchObject({ statusCode: 409 });
    expect(await PawnDisposalEntryModel.count({ where: { pawnContractId: row.id } })).toBe(0);
  });
  it('applies signed documented costs once, retains original terms and verifies surplus once across concurrent references', async () => {
    const { row, line } = await fixture();
    const originalTerms = structuredClone(row.terms);
    const expense = await photo(adminId);
    await offer(row, line.id, [{ description: 'Actual synthetic shipping invoice', amountVnd: 50000, evidenceId: expense.id }]);
    await accept(row); const accepted = structuredClone(row.disposalStatement) as PawnDisposalStatement;
    await execute(row);
    expect(row.terms).toEqual(originalTerms); expect(row.disposalSettledAt).toBeTruthy();
    const summary = (await service.summary(row))!;
    expect(summary.costsVnd).toBe(50000); expect(summary.principalAppliedVnd).toBe(1400000);
    expect(summary.interestVnd).toBe(14700); expect(summary.surplusVnd).toBe(335300); expect(summary.remainingVnd).toBe(0);
    expect(accepted.surplusVnd).toBe(335300);
    await expect(service.offer(row.id, adminId, { expectedVersion: row.version, orderItemId: line.id, costs: [{ description: 'Duplicate', amountVnd: 50000, evidenceId: expense.id }], agreementText: 'Duplicate-cost fixture' })).rejects.toMatchObject({ statusCode: 400 });
    const data = { expectedVersion: row.version, amountVnd: summary.surplusVnd, moneyVerified: true, receivingAccountVerified: true, details: 'Synthetic verified approved-account payout' };
    const results = await Promise.allSettled(['SURPLUS-A', 'SURPLUS-B'].map(key => service.payment(row.id, adminId, { ...data, externalReference: `DISPOSAL-${row.id}-${key}` }, 'surplus')));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const payout = (await PawnDisposalEntryModel.findOne({ where: { pawnContractId: row.id, kind: 'surplus' } }))!;
    await service.payment(row.id, adminId, { ...data, externalReference: payout.externalReference }, 'surplus');
    expect((await service.summary(await row.reload()))!.surplusVnd).toBe(0);
    expect(await PawnDisposalEntryModel.count({ where: { pawnContractId: row.id, kind: 'surplus' } })).toBe(1);
    await expect(db.query('UPDATE pawn_disposal_entry SET "amountVnd"=1 WHERE id=:id', { replacements: { id: payout.id } })).rejects.toThrow(/append-only/i);
    await expect(db.query('DELETE FROM pawn_disposal_entry WHERE id=:id', { replacements: { id: payout.id } })).rejects.toThrow(/append-only/i);
  });
  it('retains a shortfall, permits verified partial repayment and stops interest only at full payment', async () => {
    const { row, line } = await fixture(1000000);
    await offer(row, line.id); await accept(row); await execute(row);
    expect(row.disposalSettledAt).toBeNull();
    let summary = (await service.summary(row))!; expect(summary.remainingVnd).toBe(414700);
    await service.payment(row.id, adminId, { expectedVersion: row.version, amountVnd: 200000, externalReference: `DISPOSAL-PARTIAL-${row.id}`, moneyVerified: true, details: 'Synthetic partial debt payment' }, 'repayment');
    await row.reload(); expect(row.disposalSettledAt).toBeNull(); summary = (await service.summary(row))!;
    expect(summary.remainingVnd).toBe(214700);
    await expect(service.payment(row.id, adminId, { expectedVersion: row.version, amountVnd: 214701, externalReference: `DISPOSAL-OVER-${row.id}`, moneyVerified: true, details: 'Synthetic overpayment rejected' }, 'repayment')).rejects.toMatchObject({ statusCode: 409 });
    await service.payment(row.id, adminId, { expectedVersion: row.version, amountVnd: 214700, externalReference: `DISPOSAL-FINAL-${row.id}`, moneyVerified: true, details: 'Synthetic final debt payment' }, 'repayment');
    await row.reload(); expect(row.disposalSettledAt).toBeTruthy(); expect((await service.summary(row))!.remainingVnd).toBe(0);
    expect((await pawn.detail(row.id, ownerId)).estimate.remainingVnd).toBe(0);
  });
  it('rejects stale accrual and requires fresh scans after customer withdrawal', async () => {
    const { row, line } = await fixture(); await offer(row, line.id); await accept(row);
    const acceptedEvidence = row.disposalStatement!.signatureEvidenceIds;
    await PawnContractModel.update({ disbursedAt: new Date(Date.now() - 36 * PAWN_DAY_MS) }, { where: { id: row.id } });
    await expect(execute(row)).rejects.toMatchObject({ statusCode: 409, code: 'PAWN_STATEMENT_STALE' });
    await service.decide(row.id, ownerId, { expectedVersion: row.version, decision: 'withdraw', details: 'Fixture review after day boundary' });
    await offer(row, line.id);
    await expect(service.decide(row.id, ownerId, { expectedVersion: row.version, decision: 'accept', termsAccepted: true, costsAccepted: true, evidenceIds: acceptedEvidence, bankName: 'Test', accountNumber: 'Test', holderName: 'Test' })).rejects.toMatchObject({ statusCode: 400 });
    const prior = (await EvidenceModel.findByPk(acceptedEvidence[0]))!;
    const reupload = await EvidenceModel.create({ ...prior.get({ plain: true }), id: undefined, entityId: null, diskKey: `${crypto.randomUUID()}.webp` });
    await expect(service.decide(row.id, ownerId, { expectedVersion: row.version, decision: 'accept', termsAccepted: true, costsAccepted: true, evidenceIds: [reupload.id], bankName: 'Test', accountNumber: 'Test', holderName: 'Test' })).rejects.toMatchObject({ statusCode: 400 });
    expect(await PawnDisposalEntryModel.count({ where: { pawnContractId: row.id } })).toBe(0);
  });
  it('freezes disputed payouts and corrects verified source refunds only under a new signed amendment', async () => {
    const { row, order, line } = await fixture(); await offer(row, line.id); await accept(row); await execute(row);
    const claim = await ReturnRequestModel.create({ userId: buyerId, orderId: order.id, status: 'REQUESTED', resolutionStatus: 'pending' });
    expect((await service.summary(row))!.reconciliationRequired).toBe(true);
    const payout = { expectedVersion: row.version, amountVnd: 385300, externalReference: `DISPOSAL-BLOCKED-${row.id}`, moneyVerified: true, receivingAccountVerified: true, details: 'Disputed funds fixture' };
    await expect(service.payment(row.id, adminId, payout, 'surplus')).rejects.toMatchObject({ statusCode: 409, code: 'PAWN_SALE_DISPUTED' });
    await claim.update({ resolutionStatus: 'resolved', status: 'RECEIVED' });
    await new LoyaltyService().confirmRefund(order.id, adminId, { merchandiseVnd: 700000, lineRefunds: [{ orderItemId: line.id, merchandiseVnd: 700000 }], externalReference: `DISPOSAL-REFUND-${row.id}`, moneyVerified: true, reason: 'Synthetic verified partial merchandise refund' });
    expect((await service.summary(row))!.reconciliationRequired).toBe(true);
    await expect(service.payment(row.id, adminId, payout, 'surplus')).rejects.toMatchObject({ statusCode: 409, code: 'PAWN_SALE_RECONCILIATION_REQUIRED' });
    await offer(row, line.id); await accept(row); await execute(row);
    const summary = (await service.summary(row))!; expect(summary.proceedsVnd).toBe(1100000); expect(summary.remainingVnd).toBe(314700);
    expect(summary.reconciliationRequired).toBe(false);
    expect(await PawnDisposalEntryModel.count({ where: { pawnContractId: row.id, kind: 'sale_revision' } })).toBe(1);
    expect(await PawnEventModel.count({ where: { pawnContractId: row.id, action: 'disposal_applied' } })).toBe(2);
  });
  it('requires exact mixed-order line refund amounts and prevents cross-workflow bank reference reuse', async () => {
    const { row, line, order } = await fixture(1800000, true, true);
    const refund = { merchandiseVnd: 100000, externalReference: `DISPOSAL-MIXED-REFUND-${row.id}`, moneyVerified: true, reason: 'Mixed-order original-line fixture' };
    await expect(new LoyaltyService().confirmRefund(order.id, adminId, refund)).rejects.toMatchObject({ statusCode: 400, code: 'PAWN_REFUND_ALLOCATION_REQUIRED' });
    await expect(new LoyaltyService().confirmRefund(order.id, adminId, { ...refund, lineRefunds: [{ orderItemId: line.id, merchandiseVnd: 100001 }] })).rejects.toMatchObject({ statusCode: 400 });
    await new LoyaltyService().confirmRefund(order.id, adminId, { ...refund, lineRefunds: [{ orderItemId: line.id, merchandiseVnd: 100000 }] });
    await offer(row, line.id); expect(row.disposalStatement!.netProceedsVnd).toBe(1700000); await accept(row); await execute(row);
    await expect(service.payment(row.id, adminId, { expectedVersion: row.version, amountVnd: 285300, externalReference: refund.externalReference, moneyVerified: true, receivingAccountVerified: true, details: 'Cross-ledger reference fixture' }, 'surplus')).rejects.toMatchObject({ statusCode: 409, code: 'PAYMENT_REFERENCE_REUSED' });
    expect(await OrderRefundModel.count({ where: { orderId: order.id } })).toBe(1);
    // Wrong ownership cannot bind a staff expense to another customer's contract.
    const foreign = await photo(otherId);
    await expect(db.transaction(transaction => new EvidenceService().bind([foreign.id], adminId, 'pawn_settlement', row.id, transaction))).rejects.toMatchObject({ statusCode: 404 });
  });
});
