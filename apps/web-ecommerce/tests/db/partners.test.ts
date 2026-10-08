import crypto from 'crypto';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase } from './support/testDb';
import PartnerService from '../../src/core/server/services/PartnerService';
import UserModel from '../../src/core/server/database/internal/models/User.Model';
import EvidenceModel from '../../src/core/server/database/client/models/Evidence.Model';
import PartnerProfileModel from '../../src/core/server/database/client/models/PartnerProfile.Model';
import PartnerEventModel from '../../src/core/server/database/client/models/PartnerEvent.Model';
import CommercePolicyModel from '../../src/core/server/database/client/models/CommercePolicy.Model';
import ProductModel from '../../src/core/server/database/client/models/Product.Model';
import CouponModel from '../../src/core/server/database/client/models/Coupon.Model';
import CartService from '../../src/core/server/services/CartService';

describe('private partner onboarding and staff verification', () => {
  let db: Sequelize, userId: number, otherId: number, adminId: number;
  const service = new PartnerService();
  const application = {
    legalName: 'Fixture Seller Identity',
    displayName: 'Fixture Collector Shop',
    phone: '0901234567',
    pickupAddress: '12 Fixture Dispatch Road',
    experience: 'Inspect actual parts and disclose every missing accessory.',
    bankName: 'Fixture Bank',
    bankAccount: '0012345678',
    accountHolder: 'Fixture Seller Identity',
  };
  const photo = async (ownerUserId = userId, purpose = 'partner_verification') =>
    EvidenceModel.create({
      ownerUserId,
      purpose,
      diskKey: `${crypto.randomUUID()}.png`,
      originalName: 'Private identity fixture.png',
      mimeType: 'image/png',
      sizeBytes: 100,
      sha256: crypto.randomBytes(32).toString('hex'),
    });
  beforeAll(async () => {
    db = await seedTestDatabase();
    [userId, otherId] = (
      await UserModel.findAll({ where: { role: 'USER', isActive: true }, limit: 2, order: [['id', 'ASC']] })
    ).map((user) => user.id);
    adminId = (await UserModel.findOne({ where: { role: 'ADMIN', isActive: true } }))!.id;
  }, 120000);
  afterAll(async () => {
    await db?.close();
  });

  it('serializes repeated applications and isolates identity evidence and bank details', async () => {
    const evidence = await photo(),
      body = { application, evidenceIds: [evidence.id], requestKey: crypto.randomUUID(), termsAccepted: true };
    const [a, b] = await Promise.all([service.submit(userId, body), service.submit(userId, body)]);
    expect(a.id).toBe(b.id);
    expect(await PartnerEventModel.count({ where: { partnerId: a.id } })).toBe(1);
    expect(a.application.bankAccount).toBe(application.bankAccount);
    expect(a).not.toHaveProperty('requestDigest');
    expect(a).not.toHaveProperty('currentEvidenceIds');
    expect(a.evidence[0].toJSON()).not.toHaveProperty('diskKey');
    await expect(service.detail(a.id, otherId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.list(userId)).rejects.toMatchObject({ statusCode: 403 });
    const queue = await service.list(adminId);
    expect(queue.count).toBe(1);
    expect(queue.rows[0].toJSON()).not.toHaveProperty('application');
    await expect(
      service.submit(userId, { ...body, application: { ...application, bankAccount: '0099999999' } }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.submit(otherId, { ...body, requestKey: crypto.randomUUID() })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(await PartnerProfileModel.count({ where: { userId: otherId } })).toBe(0);
  });

  it('requires current-version bilateral checks and exposes only current revision evidence', async () => {
    const otherEvidence = await photo(otherId),
      firstBody = {
        application,
        evidenceIds: [otherEvidence.id],
        requestKey: crypto.randomUUID(),
        termsAccepted: true,
      };
    let row = await service.submit(otherId, firstBody);
    const firstVersion = row.version;
    row = await service.act(
      row.id,
      adminId,
      {
        action: 'request_changes',
        expectedVersion: row.version,
        reason: 'Fixture review: verify the current account-holder spelling.',
      },
      true,
    );
    const wrongPurpose = await photo(otherId, 'pawn');
    await expect(
      service.act(row.id, otherId, {
        action: 'revise',
        expectedVersion: row.version,
        application,
        evidenceIds: [wrongPurpose.id],
        termsAccepted: true,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    const currentEvidence = await photo(otherId);
    row = await service.act(row.id, otherId, {
      action: 'revise',
      expectedVersion: row.version,
      application: { ...application, accountHolder: 'Verified Fixture Seller' },
      evidenceIds: [currentEvidence.id],
      termsAccepted: true,
    });
    expect(row.evidence.map((file: EvidenceModel) => file.id)).toEqual([currentEvidence.id]);
    const review = {
      action: 'verify',
      expectedVersion: row.version,
      reason: 'Fixture-only actual identity and matching-bank check.',
      identityVerified: true,
      bankVerified: true,
      maxListings: 3,
      maxListingValueVnd: 2000000,
    };
    await expect(
      service.act(row.id, adminId, { ...review, expectedVersion: firstVersion }, true),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.act(row.id, adminId, { ...review, bankVerified: false }, true)).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(service.act(row.id, adminId, { ...review, maxListings: 0 }, true)).rejects.toMatchObject({
      statusCode: 400,
    });
    row = await service.act(row.id, adminId, review, true);
    expect(row.status).toBe('verified');
    expect(row.identityVerifiedAt).toBeTruthy();
    expect(row.bankVerifiedAt).toBeTruthy();
    await expect(
      service.act(row.id, otherId, {
        action: 'revise',
        expectedVersion: row.version,
        application,
        evidenceIds: [currentEvidence.id],
        termsAccepted: true,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await CommercePolicyModel.count()).toBe(0);
  });

  it('audits reviewed restrictions and suspension without erasing the application', async () => {
    let row = (await service.mine(otherId))!;
    await expect(
      service.act(
        row.id,
        userId,
        { action: 'suspend', expectedVersion: row.version, reason: 'Unauthorized fixture attempt' },
        true,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    row = await service.act(
      row.id,
      adminId,
      {
        action: 'restrict',
        expectedVersion: row.version,
        reason: 'Fixture reviewed restriction',
        maxListings: 1,
        maxListingValueVnd: 1000000,
      },
      true,
    );
    expect(row.status).toBe('restricted');
    expect(row.maxListings).toBe(1);
    row = await service.act(
      row.id,
      adminId,
      { action: 'suspend', expectedVersion: row.version, reason: 'Fixture evidence-backed suspension' },
      true,
    );
    expect(row.status).toBe('suspended');
    expect(row.application.bankAccount).toBe(application.bankAccount);
    row = await service.act(
      row.id,
      adminId,
      {
        action: 'restore',
        expectedVersion: row.version,
        reason: 'Fixture corrective review completed',
        maxListings: 2,
        maxListingValueVnd: 1500000,
      },
      true,
    );
    expect(row.status).toBe('verified');
    const event = (await PartnerEventModel.findOne({ where: { partnerId: row.id } }))!;
    await expect(event.update({ action: 'rewritten' })).rejects.toThrow();
    await expect(PartnerProfileModel.destroy({ where: { id: row.id } })).rejects.toThrow();
    await UserModel.update({ isActive: false }, { where: { id: otherId } });
    await expect(service.mine(otherId)).rejects.toMatchObject({ statusCode: 403 });
    await UserModel.update({ isActive: true }, { where: { id: otherId } });
  });

  it('excludes unreviewed listings and partner value from shop-benefit eligibility', async () => {
    const partner = (await service.mine(otherId))!;
    const own = (await ProductModel.findOne({ where: { condition: 'new', isArchived: false } }))!;
    // A disposable read-only quote fixture; no seller publication, guarantee or paid order is activated.
    const listing = await ProductModel.create({
      name: 'Synthetic partner quote fixture',
      sku: 'PARTNER-SCOPE-FIXTURE',
      brandName: 'Fixture Manufacturer',
      categoryId: own.categoryId,
      price: 900000,
      importPrice: 0,
      stock: 1,
      sold: 0,
      imageUrl: own.imageUrl,
      partnerId: partner.id,
      listingStatus: 'draft',
      condition: 'new',
      availableSizes: [],
      gender: 'unisex',
    });
    const carts = new CartService(),
      items = [
        { productId: own.id, quantity: 1, size: '' },
        { productId: listing.id, quantity: 1, size: '' },
      ];
    expect((await carts.quote(items)).lines[1].status).toBe('UNAVAILABLE');
    await listing.update({ listingStatus: 'published' });
    const coupon = await CouponModel.create({
      code: 'PARTNER_SCOPE',
      title: 'Synthetic scope fixture',
      discountPercent: 10,
      isActive: true,
      minOrderVnd: own.price + 1,
      startDate: new Date(Date.now() - 60000),
      expirationDate: new Date(Date.now() + 60000),
      source: 'admin',
      usageCount: 0,
    });
    await expect(carts.quote(items, coupon.code, userId)).rejects.toMatchObject({ statusCode: 400 });
    await coupon.update({ minOrderVnd: 0 });
    const quote = await carts.quote(items, coupon.code, userId);
    expect(quote.benefitSubtotalVnd).toBe(own.price);
    expect(quote.subtotal).toBe(own.price + listing.price);
    expect(quote.discount).toBe(Math.round(own.price / 10));
    expect(quote.total).toBe(own.price + listing.price - quote.discount);
    expect((await CouponModel.findByPk(coupon.id))!.usageCount).toBe(0);
  });
});
