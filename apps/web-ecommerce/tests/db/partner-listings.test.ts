import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase } from './support/testDb';
import PartnerService from '../../src/core/server/services/PartnerService';
import PartnerListingService from '../../src/core/server/services/PartnerListingService';
import FileStorageService from '../../src/core/server/services/FileStorageService';
import ProductService from '../../src/core/server/services/ProductService';
import StockImportService from '../../src/core/server/services/StockImportService';
import UserModel from '../../src/core/server/database/internal/models/User.Model';
import EvidenceModel from '../../src/core/server/database/client/models/Evidence.Model';
import PartnerProfileModel from '../../src/core/server/database/client/models/PartnerProfile.Model';
import PartnerMediaModel from '../../src/core/server/database/client/models/PartnerMedia.Model';
import PartnerListingEventModel from '../../src/core/server/database/client/models/PartnerListingEvent.Model';
import ProductModel from '../../src/core/server/database/client/models/Product.Model';
import CategoryModel from '../../src/core/server/database/client/models/Category.Model';
import SupplierModel from '../../src/core/server/database/client/models/Supplier.Model';
import OrderModel from '../../src/core/server/database/client/models/Order.Model';
import { lockProductsBySku } from '../../src/core/server/services/agent/AgentWrites';

describe('owned partner inventory and content moderation', () => {
  let db: Sequelize, userId: number, otherId: number, adminId: number, categoryId: number, partnerId: number;
  const listings = new PartnerListingService(),
    partners = new PartnerService();
  const photos = async (ownerUserId = userId, duplicate = false) =>
    Promise.all(
      [0, 1, 2].map(() =>
        PartnerMediaModel.create({
          ownerUserId,
          url: `/uploads/products/${crypto.randomUUID()}.png`,
          sha256: duplicate ? 'a'.repeat(64) : crypto.randomBytes(32).toString('hex'),
          originalName: 'Explicit synthetic merchandise fixture.png',
          publicationConsentAt: new Date(),
        }),
      ),
    );
  const draft = async (ownerUserId = userId) => ({
    requestKey: crypto.randomUUID(),
    name: 'Fixture Gundam listing',
    brandName: 'Fixture manufacturer',
    modelCode: 'FIXTURE-RG',
    grade: 'RG',
    scale: '1/144',
    series: 'Fixture universe',
    description: 'Synthetic fixture: original runners and disclosed condition.',
    condition: 'preowned',
    assemblyState: 'assembled',
    boxCondition: 'Fixture worn box',
    includedAccessories: ['Fixture weapon'],
    defects: ['Fixture missing antenna'],
    price: 150000,
    stock: 1,
    dispatchDays: 2,
    categoryId,
    conditionConfirmed: true,
    photoIds: (await photos(ownerUserId)).map((photo) => photo.id),
  });
  const verify = async (id: number) => {
    const evidence = await EvidenceModel.create({
      ownerUserId: id,
      purpose: 'partner_verification',
      diskKey: `${crypto.randomUUID()}.png`,
      originalName: 'Synthetic private identity fixture.png',
      mimeType: 'image/png',
      sizeBytes: 100,
      sha256: crypto.randomBytes(32).toString('hex'),
    });
    let profile = await partners.submit(id, {
      requestKey: crypto.randomUUID(),
      evidenceIds: [evidence.id],
      termsAccepted: true,
      application: {
        legalName: `Synthetic Seller ${id}`,
        displayName: `Synthetic Shop ${id}`,
        phone: '0901234567',
        pickupAddress: 'Synthetic warehouse',
        experience: 'Synthetic inspection fixture',
        bankName: 'Fixture Bank',
        bankAccount: `001234567${id}`,
        accountHolder: `Synthetic Seller ${id}`,
      },
    });
    profile = await partners.act(
      profile.id,
      adminId,
      {
        action: 'verify',
        expectedVersion: profile.version,
        reason: 'Fixture-only identity and account check',
        identityVerified: true,
        bankVerified: true,
        maxListings: 20,
        maxListingValueVnd: 500000,
      },
      true,
    );
    return profile.id;
  };
  beforeAll(async () => {
    db = await seedTestDatabase();
    [userId, otherId] = (
      await UserModel.findAll({ where: { role: 'USER', isActive: true }, limit: 2, order: [['id', 'ASC']] })
    ).map((row) => row.id);
    adminId = (await UserModel.findOne({ where: { role: 'ADMIN', isActive: true } }))!.id;
    categoryId = (await CategoryModel.findOne())!.id;
    partnerId = await verify(userId);
    await verify(otherId);
  }, 120000);
  afterAll(async () => {
    await db?.close();
  });
  it('requires public-photo consent and signatures without reusing private identity evidence', async () => {
    const app = express();
    app.post('/photos', async (req, res) => {
      try {
        res.json(await new FileStorageService().savePartnerImages(req, res, userId));
      } catch (error) {
        res
          .status((error as { statusCode?: number }).statusCode || 500)
          .json({ code: (error as { code?: string }).code });
      }
    });
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYZkAAAAASUVORK5CYII=',
      'base64',
    );
    const count = await PartnerMediaModel.count();
    expect(
      (await request(app).post('/photos').attach('files', png, { filename: 'fixture.png', contentType: 'image/png' }))
        .status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/photos')
          .field('publicationConsent', 'true')
          .attach('files', Buffer.from('not a photograph'), { filename: 'wrong.png', contentType: 'image/png' })
      ).status,
    ).toBe(400);
    expect(await PartnerMediaModel.count()).toBe(count);
    const result = await request(app)
      .post('/photos')
      .field('publicationConsent', 'true')
      .attach('files', png, { filename: 'actual synthetic pixel.png', contentType: 'image/png' });
    expect(result.status).toBe(200);
    expect(result.body[0]).toMatchObject({
      ownerUserId: userId,
      sha256: crypto.createHash('sha256').update(png).digest('hex'),
    });
    expect(result.body[0].url).toMatch(/^\/uploads\/products\//);
    expect(result.body[0]).not.toHaveProperty('diskKey');
  });
  it('serializes creation/replay, strips ownership escalation and enforces media tenancy', async () => {
    const body = await draft();
    const [a, b] = await Promise.all([
      listings.create(userId, { ...body, partnerId: 999, isArchived: false, listingStatus: 'published' }),
      listings.create(userId, body),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.partnerId).toBe(partnerId);
    expect(a.listingStatus).toBe('draft');
    expect(a.isArchived).toBe(true);
    expect(a).not.toHaveProperty('listingRequestDigest');
    await ProductModel.update({ stock: 0 }, { where: { id: a.id } });
    await expect(
      listings.act(a.id, userId, { ...body, action: 'edit', expectedVersion: a.listingVersion, expectedStock: 1 }),
    ).rejects.toMatchObject({ code: 'STOCK_CHANGED' });
    expect((await ProductModel.findByPk(a.id))!.stock).toBe(0);
    expect(await PartnerListingEventModel.count({ where: { productId: a.id } })).toBe(1);
    await expect(listings.detail(a.id, otherId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(listings.list(userId, 0, true)).rejects.toMatchObject({ statusCode: 403 });
    await expect(listings.create(userId, { ...body, price: 150001 })).rejects.toMatchObject({ statusCode: 409 });
    await expect(listings.create(otherId, { ...body, requestKey: crypto.randomUUID() })).rejects.toMatchObject({
      statusCode: 404,
    });
    const privatePhoto = await EvidenceModel.findOne({
      where: { ownerUserId: userId, purpose: 'partner_verification' },
    });
    await expect(
      listings.create(userId, { ...body, requestKey: crypto.randomUUID(), photoIds: [privatePhoto!.id] }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      listings.create(userId, {
        ...body,
        requestKey: crypto.randomUUID(),
        photoIds: (await photos(userId, true)).map((file) => file.id),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(listings.create(userId, { ...body, requestKey: crypto.randomUUID(), stock: 2 })).rejects.toMatchObject(
      { statusCode: 400 },
    );
    await expect(
      listings.create(userId, { ...body, requestKey: crypto.randomUUID(), conditionConfirmed: false }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
  it('keeps revised approvals distinct from public selling and rejects stale simultaneous edits', async () => {
    const body = await draft();
    let row = await listings.create(userId, body);
    row = await listings.act(row.id, userId, { action: 'submit', expectedVersion: row.listingVersion });
    await expect(
      listings.act(row.id, userId, { ...body, action: 'edit', expectedVersion: row.listingVersion }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      listings.act(
        row.id,
        adminId,
        { action: 'approve', expectedVersion: row.listingVersion, reason: 'Fixture actual review' },
        true,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    row = await listings.act(
      row.id,
      adminId,
      { action: 'reject', expectedVersion: row.listingVersion, reason: 'Fixture missing-condition disclosure' },
      true,
    );
    const edits = await Promise.allSettled([
      listings.act(row.id, userId, {
        ...body,
        action: 'edit',
        expectedVersion: row.listingVersion,
        description: 'Revised synthetic description A',
      }),
      listings.act(row.id, userId, {
        ...body,
        action: 'edit',
        expectedVersion: row.listingVersion,
        description: 'Revised synthetic description B',
      }),
    ]);
    expect(edits.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((edits.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({
      statusCode: 409,
    });
    row = await listings.detail(row.id, userId);
    row = await listings.act(row.id, userId, { action: 'submit', expectedVersion: row.listingVersion });
    row = await listings.act(
      row.id,
      adminId,
      {
        action: 'approve',
        expectedVersion: row.listingVersion,
        reason: 'Fixture photos and condition actually reviewed',
        actualPhotosVerified: true,
        descriptionVerified: true,
      },
      true,
    );
    expect(row.listingStatus).toBe('approved');
    expect(row.isArchived).toBe(true);
    const catalog = new ProductService();
    await expect(catalog.getPublicById(row.id)).rejects.toMatchObject({ statusCode: 404 });
    expect((await catalog.listPublic({ q: 'Fixture Gundam listing', limit: 30, offset: 0 })).count).toBe(0);
    await expect(
      listings.act(row.id, userId, { action: 'publish', expectedVersion: row.listingVersion }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      db.query(`UPDATE partner_listing_event SET action='rewritten' WHERE "productId"=${row.id}`),
    ).rejects.toThrow(/append-only/i);
  });
  it('blocks legacy catalog/import bypasses and preserves hidden listings after seller restoration', async () => {
    const body = await draft();
    let row = await listings.create(userId, body);
    const catalog = new ProductService();
    await expect(
      catalog.update(row.id, {
        ...body,
        sku: row.sku,
        imageUrl: row.imageUrl,
        images: row.photos.slice(1).map((photo: { url: string }) => photo.url),
        isArchived: false,
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'PARTNER_LISTING_REQUIRED' });
    await expect(catalog.remove(row.id)).rejects.toMatchObject({ statusCode: 409, code: 'PARTNER_LISTING_REQUIRED' });
    await expect(db.transaction((transaction) => lockProductsBySku([row.sku], transaction))).rejects.toMatchObject({
      code: 'approval_required',
      reason: 'seller_workflow_required',
    });
    const supplier = (await SupplierModel.findOne({ where: { isActive: true } }))!;
    await expect(
      new StockImportService().create(adminId, {
        supplierId: supplier.id,
        items: [{ productId: row.id, quantity: 1, importPrice: 1 }],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    // Only this disposable fixture sets public state to exercise suspension. There is no publication API yet.
    await ProductModel.update({ listingStatus: 'published', isArchived: false }, { where: { id: row.id } });
    const orderCount = await OrderModel.count();
    let profile = await partners.detail(partnerId, userId);
    profile = await partners.act(
      partnerId,
      adminId,
      { action: 'suspend', expectedVersion: profile.version, reason: 'Fixture reviewed suspension' },
      true,
    );
    row = await listings.detail(row.id, userId);
    expect(row.listingStatus).toBe('hidden');
    expect(row.stock).toBe(1);
    expect(await OrderModel.count()).toBe(orderCount);
    await expect(listings.create(userId, await draft())).rejects.toMatchObject({ statusCode: 409 });
    await partners.act(
      partnerId,
      adminId,
      {
        action: 'restore',
        expectedVersion: profile.version,
        reason: 'Fixture reviewed restoration',
        maxListings: 20,
        maxListingValueVnd: 500000,
      },
      true,
    );
    expect((await listings.detail(row.id, userId)).listingStatus).toBe('hidden');
    expect(row.events.at(-1)?.action).toBe('seller_suspended');
  });
  it('serializes listing caps and rechecks the complete quantity value under reviewed restrictions', async () => {
    let profile = await partners.mine(otherId);
    await partners.act(
      profile!.id,
      adminId,
      {
        action: 'restrict',
        expectedVersion: profile!.version,
        reason: 'Fixture one-listing limit',
        maxListings: 1,
        maxListingValueVnd: 300000,
      },
      true,
    );
    const a = await draft(otherId),
      b = await draft(otherId);
    const result = await Promise.allSettled([listings.create(otherId, a), listings.create(otherId, b)]);
    expect(result.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect((result.find((row) => row.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({
      code: 'PARTNER_LIMIT_EXCEEDED',
    });
    const own = await draft();
    await expect(listings.create(userId, { ...own, condition: 'new', stock: 4 })).rejects.toMatchObject({
      code: 'PARTNER_LIMIT_EXCEEDED',
    });
    const row = (
      result.find((row) => row.status === 'fulfilled') as PromiseFulfilledResult<
        Awaited<ReturnType<typeof listings.create>>
      >
    ).value;
    const submitted = await listings.act(row.id, otherId, { action: 'submit', expectedVersion: row.listingVersion });
    profile = await partners.mine(otherId);
    await PartnerProfileModel.update({ maxListingValueVnd: 100000 }, { where: { id: profile!.id } });
    await expect(
      listings.act(
        row.id,
        adminId,
        {
          action: 'approve',
          expectedVersion: submitted.listingVersion,
          reason: 'Fixture lower limit',
          actualPhotosVerified: true,
          descriptionVerified: true,
        },
        true,
      ),
    ).rejects.toMatchObject({ code: 'PARTNER_LIMIT_EXCEEDED' });
  });
});
