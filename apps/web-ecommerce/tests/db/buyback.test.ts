import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase } from './support/testDb';
import BuybackService from '../../src/core/server/services/BuybackService';
import CommercePolicyService from '../../src/core/server/services/CommercePolicyService';
import ProductService from '../../src/core/server/services/ProductService';
import OrderService from '../../src/core/server/services/OrderService';
import LoyaltyService from '../../src/core/server/services/LoyaltyService';
import UserModel from '../../src/core/server/database/internal/models/User.Model';
import EvidenceModel from '../../src/core/server/database/client/models/Evidence.Model';
import ProductModel from '../../src/core/server/database/client/models/Product.Model';
import ProductImageModel from '../../src/core/server/database/client/models/ProductImage.Model';
import BuybackPayoutModel from '../../src/core/server/database/client/models/BuybackPayout.Model';
import BuybackEventModel from '../../src/core/server/database/client/models/BuybackEvent.Model';

describe('buyback inspection, agreement, payout and source intake', () => {
  let db: Sequelize, userId: number, otherId: number, adminId: number, uploadRoot: string, sequence = 0;
  const service = new BuybackService(), policy = new CommercePolicyService();
  const asset = { name: 'Inspected Strike Freedom custom', modelCode: 'FIXTURE-SF-01', version: 'Actual inspected custom version', assemblyState: 'painted', boxCondition: 'Original box absent', accessories: 'Stand included; no additional accessories', defects: 'Paint wear on the shield', repairHistory: 'Custom paint; no reported repairs' };
  const photos = ['strike-freedom-custom.webp', 'strike-freedom-custom-side.webp', 'strike-freedom-custom-detail.webp'];
  const create = async () => {
    const evidenceIds: number[] = [];
    for (const [index, name] of photos.entries()) evidenceIds.push((await EvidenceModel.create({ ownerUserId: userId, purpose: 'buyback', diskKey: `${crypto.randomUUID()}.webp`, originalName: name, mimeType: 'image/webp', sizeBytes: 100, sha256: crypto.createHash('sha256').update(`${sequence}:${index}`).digest('hex') })).id);
    return { data: { requestKey: `buyback-fixture-${++sequence}`, asset, evidenceIds }, row: await service.create(userId, { requestKey: `buyback-fixture-${sequence}`, asset, evidenceIds }) };
  };
  const readyForDecision = async () => {
    let { row } = await create();
    row = await service.act(row.id, adminId, { expectedVersion: row.version, action: 'preliminary_offer', amountVnd: 900000, details: 'Fixture photo-based quote' }, true);
    row = await service.act(row.id, userId, { expectedVersion: row.version, action: 'send_item', inboundReference: 'FIXTURE-INBOUND-001', inboundCod: false });
    row = await service.act(row.id, adminId, { expectedVersion: row.version, action: 'received', details: 'Actual fixture inspected; shield wear differs from photos', handoverVerified: true }, true);
    return service.act(row.id, adminId, { expectedVersion: row.version, action: 'final_offer', amountVnd: 850000, details: 'Fixture final quote reduced for verified shield wear' }, true);
  };
  const readyForPayout = async () => {
    const row = await readyForDecision();
    return service.act(row.id, userId, { expectedVersion: row.version, action: 'accept' });
  };
  beforeAll(async () => {
    db = await seedTestDatabase();
    [userId, otherId] = (await UserModel.findAll({ where: { role: 'USER', isActive: true }, limit: 2, order: [['id', 'ASC']] })).map(user => user.id);
    adminId = (await UserModel.findOne({ where: { role: 'ADMIN', isActive: true } }))!.id;
    const root = path.resolve('../../.artifacts/model-universe');
    await fs.mkdir(root, { recursive: true });
    uploadRoot = await fs.mkdtemp(path.join(root, 'buyback-test-uploads-'));
    process.env.UPLOAD_DIR = uploadRoot;
  }, 600000);
  afterAll(async () => { delete process.env.UPLOAD_DIR; await db?.close(); });

  it('keeps evidence owned, exact submission retries stable, and inbound policy explicitly gated', async () => {
    const { row, data } = await create();
    expect((await service.create(userId, data)).id).toBe(row.id);
    await expect(service.create(userId, { ...data, asset: { ...asset, defects: 'Changed terms' } })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.detail(row.id, otherId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.detail(row.id, otherId, true)).rejects.toMatchObject({ statusCode: 403 });
    const quoted = await service.act(row.id, adminId, { expectedVersion: 0, action: 'preliminary_offer', amountVnd: 900000, details: 'Photo-only fixture quote' }, true);
    await expect(service.act(row.id, userId, { expectedVersion: quoted.version, action: 'send_item', inboundReference: 'FIXTURE-INBOUND-002', inboundCod: false })).rejects.toMatchObject({ statusCode: 409, code: 'POLICY_APPROVAL_REQUIRED' });
    await policy.approve('buyback', { inboundCod: 'not_supported' }, 0, adminId, 'Isolated regression policy fixture, not an owner approval');
    await expect(service.act(row.id, userId, { expectedVersion: quoted.version, action: 'send_item', inboundReference: 'FIXTURE-INBOUND-002', inboundCod: true })).rejects.toMatchObject({ statusCode: 400 });
    const result = await service.detail(row.id, userId);
    expect(result.evidence).toHaveLength(3);
    expect(result.evidence[0].get({ plain: true })).not.toHaveProperty('diskKey');
    const repeated = await Promise.all([1, 2, 3].map(() => EvidenceModel.create({ ownerUserId: userId, purpose: 'buyback', diskKey: `${crypto.randomUUID()}.webp`, originalName: 'Repeated view.webp', mimeType: 'image/webp', sizeBytes: 10, sha256: 'a'.repeat(64) })));
    await expect(service.create(userId, { requestKey: 'duplicate-views-fixture', asset, evidenceIds: repeated.map(file => file.id) })).rejects.toMatchObject({ statusCode: 400 });
  });
  it('requires inspected current-version agreement, exact executed payout, and keeps immutable money', async () => {
    let row = await readyForDecision();
    const stale = row.version;
    row = await service.act(row.id, adminId, { expectedVersion: row.version, action: 'final_offer', amountVnd: 800000, details: 'Fixture second final quote with revised disclosure' }, true);
    await expect(service.act(row.id, userId, { expectedVersion: stale, action: 'accept' })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.payout(row.id, adminId, { expectedVersion: row.version, amountVnd: 800000, externalReference: 'BUYBACK-EARLY-PAYOUT', details: 'Fixture verification', moneyVerified: true })).rejects.toMatchObject({ statusCode: 409 });
    row = await service.act(row.id, userId, { expectedVersion: row.version, action: 'accept' });
    await expect(service.act(row.id, adminId, { expectedVersion: row.version, action: 'final_offer', amountVnd: 790000, details: 'Unilateral revision' }, true)).rejects.toMatchObject({ statusCode: 409 });
    const data = { expectedVersion: row.version, amountVnd: 800000, externalReference: 'BUYBACK-VERIFIED-PAYOUT', details: 'Fixture actual bank payout', moneyVerified: true };
    await expect(service.payout(row.id, adminId, { ...data, moneyVerified: false })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.payout(row.id, adminId, { ...data, amountVnd: 799999 })).rejects.toMatchObject({ statusCode: 409 });
    const completed = await service.payout(row.id, adminId, data);
    await service.payout(row.id, adminId, data);
    expect(completed.status).toBe('completed');
    expect(completed.ownershipTransferredAt).toBeTruthy();
    expect(await BuybackPayoutModel.count({ where: { buybackRequestId: row.id } })).toBe(1);
    expect(await BuybackEventModel.count({ where: { buybackRequestId: row.id, action: 'payout' } })).toBe(1);
    await expect(db.query('UPDATE buyback_payout SET "amountVnd"=1')).rejects.toThrow(/append-only/);
    await expect(db.query("DELETE FROM buyback_event WHERE action='payout'")).rejects.toThrow(/append-only/);
  });
  it('activates one actual photographed preowned SKU after ownership, once, preserving its source', async () => {
    let row = await readyForPayout();
    const original = (await ProductModel.findOne({ order: [['id', 'ASC']] }))!.get({ plain: true });
    const publicUrls: string[] = [];
    await fs.mkdir(path.join(uploadRoot, 'products'), { recursive: true });
    for (const name of photos) {
      const diskName = `${crypto.randomUUID()}.webp`;
      await fs.copyFile(path.resolve('public/images/catalog', name), path.join(uploadRoot, 'products', diskName));
      publicUrls.push(`/uploads/products/${diskName}`);
    }
    const draft = await ProductModel.create({ ...original, id: undefined, sku: `BUYBACK-ACTUAL-${row.id}`, name: asset.name, modelCode: asset.modelCode, stock: 0, sold: 0, condition: 'preowned', assemblyState: asset.assemblyState, isArchived: true, imageUrl: publicUrls[0], defects: [asset.defects], includedAccessories: [asset.accessories], supplierId: null });
    await ProductImageModel.bulkCreate(publicUrls.slice(1).map((url, sortOrder) => ({ productId: draft.id, url, sortOrder })));
    const data = { expectedVersion: row.version, productId: draft.id, actualPhotosVerified: true, details: 'Fixture public condition reconciled with accepted inspection' };
    await expect(service.intake(row.id, adminId, data)).rejects.toMatchObject({ statusCode: 409 });
    row = await service.payout(row.id, adminId, { expectedVersion: row.version, amountVnd: 850000, externalReference: 'BUYBACK-INTAKE-PAYOUT', details: 'Fixture executed payout', moneyVerified: true });
    await service.intake(row.id, adminId, { ...data, expectedVersion: row.version });
    await service.intake(row.id, adminId, data);
    expect((await draft.reload()).stock).toBe(1);
    expect(draft.importPrice).toBe(850000);
    expect(draft.isArchived).toBe(false);
    expect(await BuybackEventModel.count({ where: { buybackRequestId: row.id, action: 'intake' } })).toBe(1);
    await expect(ProductModel.destroy({ where: { id: draft.id } })).rejects.toThrow(/foreign key/);
    expect((await new ProductService().remove(draft.id)).archived).toBe(true);
  });
  it('returns a rejected model only under customer-accepted delivery and cost terms', async () => {
    let row = await readyForDecision();
    row = await service.act(row.id, userId, { expectedVersion: row.version, action: 'reject', details: 'Fixture final amount not accepted' });
    row = await service.act(row.id, adminId, { expectedVersion: row.version, action: 'return_offer', details: 'Fixture shop pays return shipment to agreed customer address' }, true);
    await expect(service.act(row.id, adminId, { expectedVersion: row.version, action: 'return_dispatched', inboundReference: 'FIXTURE-RETURN-001', handoverVerified: true }, true)).rejects.toMatchObject({ statusCode: 409 });
    row = await service.act(row.id, userId, { expectedVersion: row.version, action: 'accept_return' });
    await expect(service.act(row.id, adminId, { expectedVersion: row.version, action: 'return_offer', details: 'Customer now pays unilateral shipping change' }, true)).rejects.toMatchObject({ statusCode: 409 });
    row = await service.act(row.id, adminId, { expectedVersion: row.version, action: 'return_dispatched', inboundReference: 'FIXTURE-RETURN-001', handoverVerified: true }, true);
    expect(row.status).toBe('cancelled');
    expect(row.returnTerms?.tracking).toBe('FIXTURE-RETURN-001');
    expect(row.ownershipTransferredAt).toBeNull();
    expect(row.payout).toBeNull();
  });
  it('serializes two payouts and prevents a COD proof from funding a buyback or refund', async () => {
    const row = await readyForPayout();
    const results = await Promise.allSettled(['BUYBACK-CONCURRENT-A', 'BUYBACK-CONCURRENT-B'].map(externalReference => service.payout(row.id, adminId, { expectedVersion: row.version, amountVnd: 850000, externalReference, details: 'Fixture verified payout', moneyVerified: true })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await BuybackPayoutModel.count({ where: { buybackRequestId: row.id } })).toBe(1);
    const orders = new OrderService(), product = (await ProductModel.findOne({ where: { condition: 'new', isArchived: false }, order: [['id', 'ASC']] }))!;
    const order = await orders.placeOrder(userId, { requestKey: crypto.randomUUID(), items: [{ productId: product.id, quantity: 1, size: '' }], shipping: { recipientName: 'Fixture Collector', phone: '0901234567', address: '12 Fixture Road', city: 'Fixture City' } });
    await orders.updateStatus(order.id, 'SHIPPED', adminId);
    await orders.updateStatus(order.id, 'DELIVERED', adminId);
    await orders.confirmCollection(order.id, adminId, { amountVnd: order.total, externalReference: 'FIXTURE-SHARED-BANK-IDENTITY', reason: 'Fixture verified COD remittance', moneyVerified: true });
    await expect(new LoyaltyService().confirmRefund(order.id, adminId, { merchandiseVnd: 1, externalReference: 'fixture-shared-bank-identity', reason: 'Cannot reuse the incoming bank remittance for an outgoing refund', moneyVerified: true })).rejects.toMatchObject({ statusCode: 409 });
    const another = await readyForPayout();
    await expect(service.payout(another.id, adminId, { expectedVersion: another.version, amountVnd: 850000, externalReference: 'fixture-shared-bank-identity', details: 'Cannot reuse another economic event', moneyVerified: true })).rejects.toMatchObject({ statusCode: 409 });
  });
});
