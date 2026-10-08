import { createHash } from 'crypto';
import { Op, type Transaction } from 'sequelize';
import DatabaseProvider from '../database/Database.Provider';
import UserModel from '../database/internal/models/User.Model';
import PartnerProfileModel from '../database/client/models/PartnerProfile.Model';
import PartnerMediaModel from '../database/client/models/PartnerMedia.Model';
import PartnerListingEventModel from '../database/client/models/PartnerListingEvent.Model';
import ProductModel from '../database/client/models/Product.Model';
import ProductImageModel from '../database/client/models/ProductImage.Model';
import ProductService from './ProductService';
import HttpError from '../../../shared/server/utils/HttpError';

const INPUT_FIELDS = [
  'name',
  'brandName',
  'description',
  'descriptionEn',
  'descriptionVi',
  'grade',
  'scale',
  'series',
  'modelCode',
  'condition',
  'assemblyState',
  'boxCondition',
  'includedAccessories',
  'defects',
  'price',
  'stock',
  'categoryId',
  'weight',
  'dimensions',
] as const;
const pageOffset = (offset: number) => {
  if (!Number.isSafeInteger(offset) || offset < 0) throw HttpError.badRequest('Invalid page offset.');
  return offset;
};

export default class PartnerListingService {
  private catalog = new ProductService();
  private async actor(userId: number, admin = false, transaction?: Transaction) {
    const user = await UserModel.findByPk(userId, { transaction });
    if (!user?.isActive || (admin && user.role !== 'ADMIN')) throw HttpError.forbidden();
  }
  async eligiblePartner(userId: number, transaction?: Transaction) {
    await this.actor(userId, false, transaction);
    const partner = await PartnerProfileModel.findOne({
      where: { userId },
      transaction,
      ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (
      !partner ||
      !['verified', 'restricted'].includes(partner.status) ||
      !partner.identityVerifiedAt ||
      !partner.bankVerifiedAt
    )
      throw HttpError.conflict('An active verified seller account is required.', 'PARTNER_VERIFICATION_REQUIRED');
    return partner;
  }
  async list(userId: number, offset = 0, admin = false) {
    await this.actor(userId, admin);
    const partner = admin ? null : await PartnerProfileModel.findOne({ where: { userId } });
    if (!admin && !partner) return { rows: [], count: 0 };
    return ProductModel.findAndCountAll({
      attributes: [
        'id',
        'partnerId',
        'sku',
        'name',
        'imageUrl',
        'price',
        'stock',
        'condition',
        'listingStatus',
        'listingVersion',
        'dispatchDays',
      ],
      where: { partnerId: admin ? { [Op.ne]: null } : partner!.id },
      offset: pageOffset(offset),
      limit: 30,
      order: [
        ['updatedAt', 'DESC'],
        ['id', 'DESC'],
      ],
    });
  }
  async detail(id: number, userId: number, admin = false) {
    await this.actor(userId, admin);
    if (!Number.isSafeInteger(id) || id < 1) throw HttpError.notFound();
    const partner = admin ? null : await PartnerProfileModel.findOne({ where: { userId } });
    if (!admin && !partner) throw HttpError.notFound();
    const row = await ProductModel.findOne({
      where: { id, partnerId: admin ? { [Op.ne]: null } : partner!.id },
      attributes: { exclude: ['listingRequestKey', 'listingRequestDigest', 'importPrice', 'supplierId'] },
    });
    if (!row) throw HttpError.notFound();
    const gallery = await ProductImageModel.findAll({ where: { productId: id }, order: [['sortOrder', 'ASC']] });
    const photos = await PartnerMediaModel.findAll({
      where: { url: { [Op.in]: [row.imageUrl, ...gallery.map((file) => file.url)] } },
      order: [['id', 'ASC']],
    });
    const byUrl = new Map(photos.map((file) => [file.url, file]));
    return {
      ...row.toJSON(),
      photos: [row.imageUrl, ...gallery.map((file) => file.url)]
        .map((url) => byUrl.get(url))
        .filter((photo): photo is PartnerMediaModel => !!photo),
      events: await PartnerListingEventModel.findAll({ where: { productId: id }, order: [['id', 'ASC']] }),
    };
  }
  private async event(
    row: ProductModel,
    actorUserId: number,
    action: string,
    details: Record<string, unknown>,
    transaction: Transaction,
  ) {
    await PartnerListingEventModel.create(
      { productId: row.id, partnerId: row.partnerId, actorUserId, action, version: row.listingVersion, details },
      { transaction },
    );
  }
  private async values(
    body: Record<string, unknown>,
    partner: PartnerProfileModel,
    sku: string,
    transaction: Transaction,
    id?: number,
  ) {
    if (body.conditionConfirmed !== true)
      throw HttpError.badRequest(
        'Confirm the actual condition and all disclosed missing parts.',
        undefined,
        'PARTNER_CONDITION_REQUIRED',
      );
    if (
      !Number.isSafeInteger(body.price) ||
      Number(body.price) < 1 ||
      Number(body.price) > 2147483647 ||
      !Number.isSafeInteger(body.stock) ||
      Number(body.stock) < 1 ||
      Number(body.stock) > 100000
    )
      throw HttpError.badRequest(
        'Use positive whole VND and inventory quantities within their supported limits.',
        undefined,
        'PARTNER_LISTING_INVALID',
      );
    if (
      !['new', 'preowned'].includes(String(body.condition)) ||
      !['unassembled', 'partially_assembled', 'assembled', 'painted'].includes(String(body.assemblyState))
    )
      throw HttpError.badRequest(
        'Select the actual condition and assembly state.',
        undefined,
        'PARTNER_LISTING_INVALID',
      );
    if (!Number.isSafeInteger(body.dispatchDays) || Number(body.dispatchDays) < 1 || Number(body.dispatchDays) > 30)
      throw HttpError.badRequest('Disclose dispatch time between 1 and 30 days.', undefined, 'PARTNER_LISTING_INVALID');
    if (
      !Array.isArray(body.photoIds) ||
      !body.photoIds.length ||
      body.photoIds.length > 10 ||
      body.photoIds.some((id) => !Number.isSafeInteger(id) || id < 1) ||
      new Set(body.photoIds).size !== body.photoIds.length
    )
      throw HttpError.badRequest('Select owned merchandise photos.', undefined, 'PARTNER_PHOTOS_INVALID');
    const photos = await PartnerMediaModel.findAll({
      where: { id: { [Op.in]: body.photoIds }, ownerUserId: partner.userId },
      transaction,
      order: [['id', 'ASC']],
    });
    if (photos.length !== body.photoIds.length) throw HttpError.notFound();
    const byId = new Map(photos.map((photo) => [photo.id, photo]));
    const ordered = body.photoIds.map((id) => byId.get(id)!);
    if (
      body.condition === 'preowned' &&
      (Number(body.stock) > 1 || new Set(photos.map((photo) => photo.sha256)).size < 3)
    )
      throw HttpError.badRequest(
        'A unique preowned model needs three distinct actual views.',
        undefined,
        'PARTNER_PHOTOS_INVALID',
      );
    const input = Object.fromEntries(INPUT_FIELDS.map((field) => [field, body[field]]));
    for (const field of ['name', 'brandName', 'modelCode', 'boxCondition', 'description']) {
      if (
        typeof input[field] !== 'string' ||
        !String(input[field]).trim() ||
        String(input[field]).length > (field === 'description' ? 5000 : 255)
      )
        throw HttpError.badRequest(
          'Complete the collectible identity and condition disclosure.',
          undefined,
          'PARTNER_LISTING_INVALID',
        );
    }
    const validated = await this.catalog.validateCatalogInput(
      {
        ...input,
        sku,
        gender: 'unisex',
        availableSizes: [],
        importPrice: 0,
        imageUrl: ordered[0].url,
        images: ordered.slice(1).map((photo) => photo.url),
        isFeatured: false,
        isArchived: true,
      },
      id,
    );
    const value = validated.values.price * validated.values.stock;
    if (!Number.isSafeInteger(value) || value < 1 || value > (partner.maxListingValueVnd || 0))
      throw HttpError.badRequest(
        'The entire listing value exceeds the reviewed seller limit.',
        undefined,
        'PARTNER_LIMIT_EXCEEDED',
      );
    const count = await ProductModel.count({
      where: { partnerId: partner.id, listingStatus: { [Op.ne]: 'hidden' }, ...(id ? { id: { [Op.ne]: id } } : {}) },
      transaction,
    });
    if (count >= (partner.maxListings || 0))
      throw HttpError.conflict('The reviewed active-listing limit has been reached.', 'PARTNER_LIMIT_EXCEEDED');
    return {
      values: { ...validated.values, dispatchDays: Number(body.dispatchDays) },
      images: validated.images,
      photoSnapshot: ordered.map((photo) => ({
        id: photo.id,
        url: photo.url,
        sha256: photo.sha256,
        publicationConsentAt: photo.publicationConsentAt,
      })),
    };
  }
  private async gallery(id: number, urls: string[], transaction: Transaction) {
    await ProductImageModel.destroy({ where: { productId: id }, transaction });
    await ProductImageModel.bulkCreate(
      urls.map((url, sortOrder) => ({ productId: id, url, sortOrder })),
      { transaction },
    );
  }
  async create(userId: number, body: Record<string, unknown>) {
    const key = body.requestKey;
    if (typeof key !== 'string' || !/^[A-Za-z0-9_.:-]{8,128}$/.test(key))
      throw HttpError.badRequest('A stable listing request identity is required.');
    const digest = createHash('sha256')
      .update(
        JSON.stringify({
          ...Object.fromEntries(INPUT_FIELDS.map((field) => [field, body[field]])),
          dispatchDays: body.dispatchDays,
          photoIds: body.photoIds,
          conditionConfirmed: body.conditionConfirmed,
        }),
      )
      .digest('hex');
    const id = await DatabaseProvider.getInstance().transaction(async (transaction) => {
      const partner = await this.eligiblePartner(userId, transaction);
      const existing = await ProductModel.findOne({
        where: { partnerId: partner.id, listingRequestKey: key },
        transaction,
      });
      if (existing) {
        if (existing.listingRequestDigest !== digest)
          throw HttpError.conflict('This request identity has a different listing.', 'PARTNER_STATE_CHANGED');
        return existing.id;
      }
      const sku = `MU-P${partner.id}-${createHash('sha256').update(key).digest('hex').slice(0, 16).toUpperCase()}`;
      const input = await this.values(body, partner, sku, transaction);
      const row = await ProductModel.create(
        {
          ...input.values,
          partnerId: partner.id,
          listingStatus: 'draft',
          listingVersion: 1,
          listingRequestKey: key,
          listingRequestDigest: digest,
        },
        { transaction },
      );
      await this.gallery(row.id, input.images, transaction);
      await this.event(
        row,
        userId,
        'created',
        { fields: input.values, photos: input.photoSnapshot, conditionConfirmed: true },
        transaction,
      );
      return row.id;
    });
    return this.detail(id, userId);
  }
  async act(id: number, userId: number, body: Record<string, unknown>, admin = false) {
    await this.actor(userId, admin);
    if (!Number.isSafeInteger(id) || id < 1) throw HttpError.notFound();
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      // Partner before product everywhere: serializes caps, moderation and suspension.
      const partner = admin
        ? await PartnerProfileModel.findByPk((await ProductModel.findByPk(id, { transaction }))?.partnerId || 0, {
            transaction,
            lock: transaction.LOCK.UPDATE,
          })
        : await this.eligiblePartner(userId, transaction);
      if (!partner) throw HttpError.notFound();
      const row = await ProductModel.findOne({
        where: { id, partnerId: partner.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!row) throw HttpError.notFound();
      if (body.expectedVersion !== row.listingVersion)
        throw HttpError.conflict('Review the latest listing version.', 'PARTNER_STATE_CHANGED');
      const action = body.action;
      if (!admin && action === 'edit' && ['draft', 'rejected', 'hidden', 'approved'].includes(row.listingStatus)) {
        const input = await this.values(body, partner, row.sku, transaction, id);
        if (input.values.stock !== row.stock && body.expectedStock !== row.stock)
          throw HttpError.conflict(
            'Available stock changed. Refresh before recording an inventory correction.',
            'STOCK_CHANGED',
          );
        await row.update(
          { ...input.values, listingStatus: 'draft', listingVersion: row.listingVersion + 1 },
          { transaction },
        );
        await this.gallery(id, input.images, transaction);
        await this.event(
          row,
          userId,
          'edited',
          { fields: input.values, photos: input.photoSnapshot, conditionConfirmed: true },
          transaction,
        );
        return;
      }
      const allowed: Partial<Record<string, string[]>> = admin
        ? { approve: ['review'], reject: ['review'], hide: ['draft', 'review', 'rejected', 'approved', 'published'] }
        : { submit: ['draft', 'rejected'], hide: ['draft', 'review', 'rejected', 'approved', 'published'] };
      if (typeof action !== 'string' || !allowed[action]?.includes(row.listingStatus))
        throw HttpError.conflict('This listing action is unavailable.', 'PARTNER_STATE_CHANGED');
      if (admin && (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 1000))
        throw HttpError.badRequest('Record the actual moderation findings.', undefined, 'PARTNER_LISTING_INVALID');
      if (
        action === 'approve' &&
        (!['verified', 'restricted'].includes(partner.status) ||
          body.actualPhotosVerified !== true ||
          body.descriptionVerified !== true)
      )
        throw HttpError.badRequest(
          'Verify the actual photos and complete condition disclosure for an active seller.',
          undefined,
          'PARTNER_REVIEW_REQUIRED',
        );
      if (
        action === 'approve' &&
        (row.price * row.stock > (partner.maxListingValueVnd || 0) ||
          (await ProductModel.count({
            where: { partnerId: partner.id, listingStatus: { [Op.ne]: 'hidden' } },
            transaction,
          })) > (partner.maxListings || 0))
      )
        throw HttpError.conflict(
          'The current reviewed seller limits no longer allow this listing.',
          'PARTNER_LIMIT_EXCEEDED',
        );
      const status =
        action === 'submit'
          ? 'review'
          : action === 'approve'
            ? 'approved'
            : action === 'reject'
              ? 'rejected'
              : 'hidden';
      await row.update(
        { listingStatus: status, isArchived: true, listingVersion: row.listingVersion + 1 },
        { transaction },
      );
      await this.event(
        row,
        userId,
        action,
        {
          reason: body.reason || null,
          actualPhotosVerified: body.actualPhotosVerified === true,
          descriptionVerified: body.descriptionVerified === true,
        },
        transaction,
      );
    });
    return this.detail(id, userId, admin);
  }
}
