import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase } from './support/testDb';
import ProductModel from '../../src/core/server/database/client/models/Product.Model';
import ProductImageModel from '../../src/core/server/database/client/models/ProductImage.Model';
import PartnerProfileModel from '../../src/core/server/database/client/models/PartnerProfile.Model';
import SupplierModel from '../../src/core/server/database/client/models/Supplier.Model';
import UserModel from '../../src/core/server/database/internal/models/User.Model';
import StockImportModel from '../../src/core/server/database/client/models/StockImport.Model';
import OrderModel from '../../src/core/server/database/client/models/Order.Model';
import CouponModel from '../../src/core/server/database/client/models/Coupon.Model';
import StockImportService from '../../src/core/server/services/StockImportService';
import ProductService from '../../src/core/server/services/ProductService';
import OrderService from '../../src/core/server/services/OrderService';
import SellerStoreService from '../../src/core/server/services/SellerStoreService';

describe('unique collectible and marketplace checkout integrity', () => {
  let db: Sequelize, used: ProductModel, fresh: ProductModel, userId: number, adminId: number, supplierId: number;
  const photos = ['/uploads/synthetic-integrity-front.webp', '/uploads/synthetic-integrity-back.webp', '/uploads/synthetic-integrity-parts.webp'];
  const shipping = { recipientName: 'Synthetic Collector', phone: '0901234567', address: '12 Synthetic Street', city: 'Synthetic City' };
  beforeAll(async () => {
    db = await seedTestDatabase();
    userId = (await UserModel.findOne({ where: { role: 'USER', isActive: true } }))!.id;
    adminId = (await UserModel.findOne({ where: { role: 'ADMIN' } }))!.id;
    supplierId = (await SupplierModel.findOne({ where: { isActive: true } }))!.id;
    const source = (await ProductModel.findOne({ where: { condition: 'new', isArchived: false } }))!;
    const base = { categoryId: source.categoryId, brandName: 'Synthetic Fixture Manufacturer', price: 200000, importPrice: 0, sold: 0, availableSizes: [], gender: 'unisex' };
    fresh = await ProductModel.create({ ...base, sku: 'INTEGRITY-NEW', name: 'Synthetic new kit', condition: 'new', stock: 3, imageUrl: source.imageUrl });
    used = await ProductModel.create({ ...base, sku: 'INTEGRITY-USED', name: 'Synthetic unique used kit', condition: 'preowned', stock: 0, imageUrl: photos[0] });
    await ProductImageModel.bulkCreate(photos.slice(1).map((url, sortOrder) => ({ productId: used.id, url, sortOrder })));
  }, 120000);
  afterAll(async () => { await db?.close(); });

  it('rolls back a mixed bulk receipt containing a unique used collectible', async () => {
    const count = await StockImportModel.count(), stock = fresh.stock;
    await expect(new StockImportService().create(adminId, { supplierId, items: [{ productId: fresh.id, quantity: 2, importPrice: 100000 }, { productId: used.id, quantity: 1, importPrice: 100000 }] })).rejects.toMatchObject({ code: 'UNIQUE_ITEM_INTAKE_REQUIRED' });
    expect(await StockImportModel.count()).toBe(count);
    expect((await fresh.reload()).stock).toBe(stock); expect((await used.reload()).stock).toBe(0);
    await new StockImportService().create(adminId, { supplierId, items: [{ productId: fresh.id, quantity: 2, importPrice: 100000 }] });
    expect((await fresh.reload()).stock).toBe(stock + 2);
  });
  it('rejects stock reissue and relabeling a retained unique item even when condition is omitted', async () => {
    const catalog = new ProductService(), body = await catalog.getAdminById(used.id);
    await expect(catalog.update(used.id, { ...body, condition: undefined, stock: 1, expectedStock: 0 })).rejects.toMatchObject({ code: 'UNIQUE_ITEM_INTAKE_REQUIRED' });
    await expect(catalog.update(used.id, { ...body, condition: 'new' })).rejects.toMatchObject({ code: 'UNIQUE_ITEM_INTAKE_REQUIRED' });
    expect((await used.reload()).condition).toBe('preowned'); expect(used.stock).toBe(0);
    await catalog.update(used.id, { ...body, condition: undefined, price: 210000 });
    expect((await used.reload()).price).toBe(210000);
  });
  it('checks distinct actual view URLs on both creates and updates with omitted condition', async () => {
    const catalog = new ProductService(), body = await catalog.getAdminById(used.id);
    await expect(catalog.update(used.id, { ...body, condition: undefined, images: [photos[0], photos[0]] })).rejects.toMatchObject({ statusCode: 400 });
    await expect(catalog.create({ ...body, sku: 'INTEGRITY-DUPLICATE-PHOTOS', images: [photos[0], photos[0]] })).rejects.toMatchObject({ statusCode: 400 });
    expect((await catalog.getAdminById(used.id)).images).toEqual(photos.slice(1));
  });
  it('does not route accidentally published partner stock through shop COD or consume shop vouchers', async () => {
    const partner = await PartnerProfileModel.create({ userId, requestKey: 'synthetic-integrity', requestDigest: 'synthetic-integrity', application: {}, currentEvidenceIds: [], status: 'verified' });
    const seller = await ProductModel.create({ name: 'Synthetic accidental publication', sku: 'INTEGRITY-PARTNER', brandName: fresh.brandName, categoryId: fresh.categoryId, imageUrl: fresh.imageUrl, price: 300000, stock: 1, sold: 0, partnerId: partner.id, listingStatus: 'published', condition: 'new', availableSizes: [] });
    const coupon = await CouponModel.create({ code: 'INTEGRITY-SHOP', title: 'Synthetic shop voucher', source: 'admin', discountPercent: 10, usageCount: 0, isActive: true, minOrderVnd: 0, startDate: new Date(0), expirationDate: new Date(Date.now() + 3600000) });
    const count = await OrderModel.count(), stock = (await fresh.reload()).stock;
    await expect(new OrderService().placeOrder(userId, { items: [{ productId: fresh.id, quantity: 1 }, { productId: seller.id, quantity: 1 }], shipping, couponCode: coupon.code })).rejects.toMatchObject({ code: 'MARKETPLACE_CHECKOUT_REQUIRED' });
    expect(await OrderModel.count()).toBe(count); expect((await fresh.reload()).stock).toBe(stock); expect((await seller.reload()).stock).toBe(1); expect((await coupon.reload()).usageCount).toBe(0);
  });
  it('returns only a factual verified public storefront and its own published merchandise', async () => {
    const partner = (await PartnerProfileModel.findOne({ where: { userId } }))!, service = new SellerStoreService();
    await expect(service.get(partner.id)).rejects.toMatchObject({ statusCode: 404 });
    await partner.update({ application: { displayName: 'Synthetic public seller', legalName: 'Private legal name', bankAccount: 'Private account' }, identityVerifiedAt: new Date(), bankVerifiedAt: new Date() });
    const body = await service.get(partner.id);
    expect(Object.keys(body).sort()).toEqual(['bankVerified', 'displayName', 'id', 'identityVerified', 'products']);
    expect(body.products.count).toBe(1); expect(body.products.rows[0].id).not.toBe(fresh.id);
    expect(JSON.stringify(body)).not.toContain('Private account'); expect(JSON.stringify(body)).not.toContain('Private legal name');
    const detail = await new ProductService().getPublicById(body.products.rows[0].id);
    expect(detail).not.toHaveProperty('listingRequestKey'); expect(detail).not.toHaveProperty('listingRequestDigest');
    const product = body.products.rows[0]; await ProductModel.update({ listingStatus: 'hidden' }, { where: { id: product.id } });
    expect((await service.get(partner.id)).products.count).toBe(0);
    await partner.update({ status: 'suspended' });
    await expect(service.get(partner.id)).rejects.toMatchObject({ statusCode: 404 });
  });
});
