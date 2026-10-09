import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase } from './support/testDb';
import PartnerService from '../../src/core/server/services/PartnerService';
import PartnerListingService from '../../src/core/server/services/PartnerListingService';
import FileStorageService from '../../src/core/server/services/FileStorageService';
import ProductService from '../../src/core/server/services/ProductService';
import PartnerGuaranteeService from '../../src/core/server/services/PartnerGuaranteeService';
import CommercePolicyService from '../../src/core/server/services/CommercePolicyService';
import PartnerGuaranteeModel from '../../src/core/server/database/client/models/PartnerGuarantee.Model';
import PartnerGuaranteePaymentModel from '../../src/core/server/database/client/models/PartnerGuaranteePayment.Model';
import MoneyReferenceService from '../../src/core/server/services/MoneyReferenceService';
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

  const approvedListing = async (price = 150001) => {
    const body = { ...(await draft()), price };
    let row = await listings.create(userId, body);
    row = await listings.act(row.id, userId, { action: 'submit', expectedVersion: row.listingVersion });
    row = await listings.act(
      row.id,
      adminId,
      {
        action: 'approve',
        expectedVersion: row.listingVersion,
        reason: 'Fixture reviewed actual condition',
        actualPhotosVerified: true,
        descriptionVerified: true,
      },
      true,
    );
    return { body, row };
  };
  const guarantees = new PartnerGuaranteeService();
  const marketplace = {
    commissionBasisPoints: 1000,
    guaranteeBasisPoints: 1000,
    guaranteeRounding: 'ceil',
    settlementDelayDays: 7,
    shippingAllocation: 'per_seller_quote',
  };
  it('requires explicit guarantee rounding and exact seller consent before recording real funds', async () => {
    const { row, body } = await approvedListing();
    await expect(listings.create(userId, { ...(await draft()), price: 150000.5 })).rejects.toMatchObject({
      code: 'PARTNER_LISTING_INVALID',
    });
    expect((await guarantees.detail(row.id, userId)).policyRequired).toBe(true);
    await expect(guarantees.detail(row.id, otherId)).rejects.toMatchObject({ statusCode: 404 });
    const policies = new CommercePolicyService();
    await expect(
      policies.approve(
        'marketplace',
        { ...marketplace, guaranteeRounding: undefined },
        0,
        adminId,
        'Fixture missing rounding',
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    await policies.approve(
      'marketplace',
      marketplace,
      0,
      adminId,
      'Explicit disposable-fixture policy, never preview activation',
    );
    const quote = (await guarantees.detail(row.id, userId)).quote!;
    expect(quote.requiredVnd).toBe(15001);
    const consent = {
      expectedVersion: row.listingVersion,
      requiredVnd: quote.requiredVnd,
      policyVersion: quote.policyVersion,
      termsAccepted: true,
    };
    await expect(guarantees.accept(row.id, userId, { ...consent, termsAccepted: false })).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(guarantees.accept(row.id, userId, { ...consent, requiredVnd: 15000 })).rejects.toMatchObject({
      statusCode: 409,
    });
    const accepted = await Promise.all([
      guarantees.accept(row.id, userId, consent),
      guarantees.accept(row.id, userId, consent),
    ]);
    expect(accepted[0].guarantees[0].id).toBe(accepted[1].guarantees[0].id);
    expect(accepted[0].guarantees[0].heldVnd).toBe(0);
    const guaranteeId = accepted[0].guarantees[0].id;
    await expect(
      listings.act(row.id, userId, { ...body, action: 'edit', expectedVersion: row.listingVersion }),
    ).rejects.toMatchObject({ code: 'PARTNER_GUARANTEE_HELD' });
    const transfer = {
      guaranteeId,
      kind: 'receipt',
      amountVnd: 15001,
      externalReference: 'FIXTURE-GUARANTEE-RECEIPT-1',
      reason: 'Explicit synthetic verified bank fixture',
      moneyVerified: true,
    };
    await expect(guarantees.confirm(row.id, userId, transfer)).rejects.toMatchObject({ statusCode: 403 });
    await expect(guarantees.confirm(row.id, adminId, { ...transfer, amountVnd: 15000 })).rejects.toMatchObject({
      code: 'PARTNER_GUARANTEE_TRANSFER',
    });
    await Promise.all([guarantees.confirm(row.id, adminId, transfer), guarantees.confirm(row.id, adminId, transfer)]);
    expect(await PartnerGuaranteePaymentModel.count({ where: { guaranteeId } })).toBe(1);
    expect((await guarantees.detail(row.id, userId)).guarantees[0].heldVnd).toBe(15001);
    await expect(
      db.transaction((transaction) =>
        MoneyReferenceService.lock(transfer.externalReference.toLowerCase(), 'order_receipt', transaction),
      ),
    ).rejects.toMatchObject({ code: 'PAYMENT_REFERENCE_REUSED' });
    await expect(
      guarantees.confirm(row.id, adminId, { ...transfer, externalReference: 'FIXTURE-GUARANTEE-OTHER-RECEIPT' }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(guarantees.cancel(row.id, userId, { guaranteeId })).rejects.toMatchObject({
      code: 'PARTNER_GUARANTEE_HELD',
    });
    expect((await ProductModel.findByPk(row.id))!.isArchived).toBe(true);
    await policies.approve(
      'marketplace',
      { ...marketplace, guaranteeRounding: 'floor' },
      1,
      adminId,
      'Fixture future policy only',
    );
    const refund = {
      guaranteeId,
      kind: 'refund',
      amountVnd: 15001,
      externalReference: 'FIXTURE-GUARANTEE-REFUND-1',
      reason: 'Fixture actual compliant withdrawal refund',
      moneyVerified: true,
      bankVerified: true,
    };
    await expect(guarantees.confirm(row.id, adminId, refund)).rejects.toMatchObject({ statusCode: 409 });
    await listings.act(row.id, userId, { action: 'hide', expectedVersion: row.listingVersion });
    await expect(guarantees.confirm(row.id, adminId, { ...refund, bankVerified: false })).rejects.toMatchObject({
      code: 'PARTNER_GUARANTEE_BANK',
    });
    await Promise.all([guarantees.confirm(row.id, adminId, refund), guarantees.confirm(row.id, adminId, refund)]);
    const returned = (await guarantees.detail(row.id, userId)).guarantees[0];
    expect(returned.heldVnd).toBe(0);
    expect(returned.terms.policyVersion).toBe(1);
    expect(returned.payments).toHaveLength(2);
    await expect(db.query(`UPDATE partner_guarantee SET "requiredVnd"=1 WHERE id=${guaranteeId}`)).rejects.toThrow(
      /append-only/i,
    );
    await expect(db.query(`DELETE FROM partner_guarantee_payment WHERE "guaranteeId"=${guaranteeId}`)).rejects.toThrow(
      /append-only/i,
    );
  });
  it('withdraws unpaid terms without fabricating a cash transaction and safely permits a new revision', async () => {
    const { row, body } = await approvedListing();
    const quote = (await guarantees.detail(row.id, userId)).quote!;
    const accepted = await guarantees.accept(row.id, userId, {
      expectedVersion: row.listingVersion,
      policyVersion: quote.policyVersion,
      requiredVnd: quote.requiredVnd,
      termsAccepted: true,
    });
    const guaranteeId = accepted.guarantees[0].id;
    await Promise.all([
      guarantees.cancel(row.id, userId, { guaranteeId }),
      guarantees.cancel(row.id, userId, { guaranteeId }),
    ]);
    expect((await guarantees.detail(row.id, userId)).guarantees[0].cancelled).toBe(true);
    expect(await PartnerGuaranteePaymentModel.count({ where: { guaranteeId } })).toBe(0);
    await expect(
      guarantees.confirm(row.id, adminId, {
        guaranteeId,
        kind: 'receipt',
        amountVnd: quote.requiredVnd,
        externalReference: 'FIXTURE-CANCELLED-GUARANTEE',
        reason: 'Fixture obsolete terms',
        moneyVerified: true,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    const revised = await listings.act(row.id, userId, {
      ...body,
      action: 'edit',
      expectedVersion: row.listingVersion,
    });
    expect(revised.listingStatus).toBe('draft');
    expect(await PartnerGuaranteeModel.count({ where: { productId: row.id } })).toBe(1);
    expect(await PartnerListingEventModel.count({ where: { productId: row.id, action: 'guarantee_cancelled' } })).toBe(
      1,
    );
  });
  it('requires new consent across policy versions and rounds a half-VND guarantee explicitly', async () => {
    const policies = new CommercePolicyService();
    await policies.approve(
      'marketplace',
      { ...marketplace, guaranteeRounding: 'nearest' },
      2,
      adminId,
      'Fixture explicit half-VND rounding',
    );
    const { row } = await approvedListing(150005);
    const quote = (await guarantees.detail(row.id, userId)).quote!;
    expect(quote.requiredVnd).toBe(15001);
    await expect(
      guarantees.accept(row.id, userId, {
        expectedVersion: row.listingVersion,
        requiredVnd: 15001,
        policyVersion: 2,
        termsAccepted: true,
      }),
    ).rejects.toMatchObject({ code: 'PARTNER_STATE_CHANGED' });
    const accepted = await guarantees.accept(row.id, userId, {
      expectedVersion: row.listingVersion,
      requiredVnd: 15001,
      policyVersion: 3,
      termsAccepted: true,
    });
    expect(accepted.guarantees[0].terms.settings).toMatchObject({ guaranteeRounding: 'nearest' });
    await guarantees.cancel(row.id, userId, { guaranteeId: accepted.guarantees[0].id });
  });
  it('keeps received guarantees after suspension and refuses a refund where publication obligations remain', async () => {
    const { row } = await approvedListing();
    const quote = (await guarantees.detail(row.id, userId)).quote!;
    const accepted = await guarantees.accept(row.id, userId, {
      expectedVersion: row.listingVersion,
      policyVersion: quote.policyVersion,
      requiredVnd: quote.requiredVnd,
      termsAccepted: true,
    });
    const guaranteeId = accepted.guarantees[0].id;
    let profile = await partners.mine(userId);
    await partners.act(
      partnerId,
      adminId,
      { action: 'suspend', expectedVersion: profile!.version, reason: 'Fixture money retention after suspension' },
      true,
    );
    await guarantees.confirm(row.id, adminId, {
      guaranteeId,
      kind: 'receipt',
      amountVnd: quote.requiredVnd,
      externalReference: 'FIXTURE-LATE-GUARANTEE-RECEIPT',
      reason: 'Fixture actual late receipt on accepted terms',
      moneyVerified: true,
    });
    expect((await guarantees.detail(row.id, userId)).guarantees[0].heldVnd).toBe(quote.requiredVnd);
    await listings.act(
      row.id,
      adminId,
      { action: 'hide', expectedVersion: row.listingVersion, reason: 'Fixture withdrawal review' },
      true,
    );
    await PartnerListingEventModel.create({
      productId: row.id,
      partnerId,
      actorUserId: adminId,
      version: row.listingVersion,
      action: 'published',
      details: { explicitFixtureOnly: true },
    });
    await expect(
      guarantees.confirm(row.id, adminId, {
        guaranteeId,
        kind: 'refund',
        amountVnd: quote.requiredVnd,
        externalReference: 'FIXTURE-BLOCKED-GUARANTEE-REFUND',
        reason: 'Fixture unresolved obligations',
        moneyVerified: true,
        bankVerified: true,
      }),
    ).rejects.toMatchObject({ code: 'PARTNER_GUARANTEE_OBLIGATIONS' });
    expect((await guarantees.detail(row.id, userId)).guarantees[0].heldVnd).toBe(quote.requiredVnd);
    expect(await PartnerGuaranteePaymentModel.count({ where: { guaranteeId } })).toBe(1);
  });
});
