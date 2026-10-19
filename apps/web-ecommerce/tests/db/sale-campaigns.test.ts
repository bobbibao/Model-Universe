import { MIGRATIONS } from '../../src/core/server/database/migrations';
import crypto from 'crypto';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase } from './support/testDb';
import ProductModel from '../../src/core/server/database/client/models/Product.Model';
import CategoryModel from '../../src/core/server/database/client/models/Category.Model';
import UserModel from '../../src/core/server/database/internal/models/User.Model';
import StockImportItemModel from '../../src/core/server/database/client/models/StockImportItem.Model';
import StockImportModel from '../../src/core/server/database/client/models/StockImport.Model';
import SupplierModel from '../../src/core/server/database/client/models/Supplier.Model';
import SaleCampaignModel from '../../src/core/server/database/client/models/SaleCampaign.Model';
import ProductDiscountModel from '../../src/core/server/database/client/models/ProductDiscount.Model';
import PromotionAuditModel from '../../src/core/server/database/client/models/PromotionAudit.Model';
import SaleCampaignService from '../../src/core/server/services/SaleCampaignService';
import ProductDiscountService from '../../src/core/server/services/ProductDiscountService';
import ProductService from '../../src/core/server/services/ProductService';
import CartService from '../../src/core/server/services/CartService';
import CouponModel from '../../src/core/server/database/client/models/Coupon.Model';

describe('store sale campaigns', () => {
  let db: Sequelize, product: ProductModel, adminId: number;
  const service = new SaleCampaignService();
  beforeAll(async () => {
    db = await seedTestDatabase();
    adminId = (await UserModel.findOne({ where: { role: 'ADMIN' } }))!.id;
    const category = (await CategoryModel.findOne())!;
    product = await ProductModel.create({
      name: 'Sale test kit',
      sku: 'SALE-TEST-KIT',
      brandName: 'Test',
      categoryId: category.id,
      gender: 'unisex',
      price: 1_000_000,
      importPrice: 100_000,
      stock: 3,
      imageUrl: '/images/catalog/gundam-unicorn.webp',
      productionDate: new Date(Date.now() - 150 * 86400_000),
    });
  }, 600_000);
  beforeEach(async () => {
    await ProductDiscountModel.destroy({ where: {} });
    await SaleCampaignModel.destroy({ where: {} });
    await product.update({
      price: 1_000_000,
      importPrice: 100_000,
      stock: 3,
      isArchived: false,
      inventoryStatus: 'available',
    });
  });
  afterAll(async () => {
    await db.close();
  });
  const input = (percent = 15) => ({
    requestKey: crypto.randomUUID(),
    title: 'Weekend builds',
    description: 'Selected models',
    percent,
    productIds: [product.id],
    startsAt: new Date(Date.now() - 60_000).toISOString(),
    endsAt: new Date(Date.now() + 86400_000).toISOString(),
  });

  it('upgrades an old catalog idempotently without rewriting published prices or actual costs', async () => {
    const qi = db.getQueryInterface();
    for (const column of ['pricingReferenceMemberVnd', 'pricingIssueCount', 'buybackPriceVnd']) await qi.removeColumn('product', column);
    const migration = MIGRATIONS.find((m) => m.name === '2026-10-20-store-sale-campaigns')!;
    await migration.up({ context: { sequelize: db } } as never);
    await migration.up({ context: { sequelize: db } } as never);
    const updated = (await ProductModel.findByPk(product.id))!;
    expect(updated.price).toBe(1_000_000);
    expect(updated.importPrice).toBe(100_000);
    expect(updated.pricingReferenceMemberVnd).toBe(900_000);
    expect(updated.buybackPriceVnd).toBe(750_000);
  });

  it('publishes idempotently, prices the cart consistently and does not leak cost snapshots', async () => {
    const body = input();
    const [a, b] = await Promise.all([service.create(body, adminId), service.create(body, adminId)]);
    expect(a.id).toBe(b.id);
    expect(await ProductDiscountModel.count({ where: { campaignRef: `store-sale:${a.id}` } })).toBe(1);
    const publicEvent = (await service.storefront()).events.find((e) => e.id === a.id)!;
    expect(publicEvent.products[0].salePrice).toBe(850_000);
    expect(JSON.stringify(publicEvent)).not.toMatch(/costVnd|importPrice|digest|createdByUserId/);
    const cart = await new CartService().quote([{ productId: product.id, quantity: 1, size: '' }]);
    expect(cart.subtotal).toBe(850_000);
    expect(await PromotionAuditModel.count({ where: { entityType: 'sale_campaign', entityId: a.id } })).toBe(1);
  });

  it('guards combined member savings using original R and actual C at quote time', async () => {
    await service.create(input(15), adminId);
    const coupon = await CouponModel.create({
      code: `SALEMEMBER-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      title: 'Sale member test',
      discountPercent: 10,
      source: 'member',
      kind: 'member',
      profitGuard: true,
      isActive: true,
      startDate: new Date(Date.now() - 86400_000),
      expirationDate: new Date(Date.now() + 86400_000),
      usageCount: 0,
    });
    const cart = new CartService();
    const quote = await cart.quote([{ productId: product.id, quantity: 1, size: '' }], coupon.code, adminId);
    expect(quote.discount).toBe(85_000);
    await ProductDiscountModel.update({ percent: 25 }, { where: { productId: product.id } });
    await expect(
      cart.quote([{ productId: product.id, quantity: 1, size: '' }], coupon.code, adminId),
    ).rejects.toThrow();
  });

  it('rejects unsafe selection atomically and rechecks current costs during sale', async () => {
    await product.update({ importPrice: 850_000 });
    await expect(service.create(input(20), adminId)).rejects.toThrow();
    expect(await SaleCampaignModel.count()).toBe(0);
    await product.update({ importPrice: 100_000 });
    await service.create(input(20), adminId);
    await product.update({ importPrice: 890_000 });
    expect((await new ProductDiscountService().getActive([product.id])).has(product.id)).toBe(false);
    expect((await service.storefront()).events).toHaveLength(0);
  });

  it('stops only this campaign and never stacks overlapping direct sales', async () => {
    const first = await service.create(input(15), adminId);
    const second = await service.create(input(20), adminId);
    let events = (await service.storefront()).events;
    expect(events.find((e) => e.id === first.id)).toBeUndefined();
    expect(events.find((e) => e.id === second.id)?.maximumPercent).toBe(20);
    await service.cancel(second.id, adminId);
    await service.cancel(second.id, adminId);
    events = (await service.storefront()).events;
    expect(events.find((e) => e.id === first.id)?.maximumPercent).toBe(15);
  });

  it('does not publish future events early and removes expired prices', async () => {
    const body = input();
    body.startsAt = new Date(Date.now() + 3600_000).toISOString();
    await service.create(body, adminId);
    expect((await service.storefront()).events).toHaveLength(0);
    expect((await service.storefront(new Date(Date.now() + 2 * 3600_000))).events).toHaveLength(1);
    expect((await service.storefront(new Date(Date.now() + 2 * 86400_000))).events).toHaveLength(0);
  });

  it('runs weekly once across workers, ranks old stock and skips current receipts', async () => {
    await service.saveRule({ enabled: true, minAgeDays: 60, productLimit: 100, maxPercent: 25 }, adminId);
    const supplier = (await SupplierModel.findOne())!;
    const receipt = await StockImportModel.create({ supplierId: supplier.id, createdBy: adminId, totalCost: 100_000 });
    await StockImportItemModel.create({
      stockImportId: receipt.id,
      productId: product.id,
      quantity: 1,
      importPrice: 100_000,
    });
    expect((await service.candidates()).find((p) => p.id === product.id)?.ageDays).toBe(0);
    const [a, b] = await Promise.all([service.runWeekly(), service.runWeekly()]);
    expect(a!.id).toBe(b!.id);
    expect((a!.settings.products as { id: number }[]).some((p) => p.id === product.id)).toBe(false);
    expect(await SaleCampaignModel.count({ where: { kind: 'weekly' } })).toBe(1);
  });

  it('requires formula inputs for new catalog prices and rejects output tampering', async () => {
    const data = {
      name: 'Formula kit',
      brandName: 'Test',
      sku: 'FORMULA-KIT',
      imageUrl: '/images/catalog/gundam-unicorn.webp',
      categoryId: product.categoryId,
      price: 1_222_222,
      importPrice: 900_000,
      stock: 1,
      pricingReferenceMemberVnd: 1_100_000,
      pricingIssueCount: 0,
    };
    const catalog = new ProductService();
    const validated = await catalog.validateCatalogInput(data);
    expect(validated.values.price).toBe(1_222_222);
    expect(validated.values.buybackPriceVnd).toBe(900_000);
    await expect(catalog.validateCatalogInput({ ...data, price: 999_999 })).rejects.toThrow();
    await expect(catalog.validateCatalogInput({ ...data, buybackPriceVnd: 1 })).rejects.toThrow();
    await expect(
      catalog.validateCatalogInput({ ...data, pricingReferenceMemberVnd: undefined, pricingIssueCount: undefined }),
    ).rejects.toThrow();
  });
});
