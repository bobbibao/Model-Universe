import { createHash } from 'crypto';
import type { Transaction } from 'sequelize';
import DatabaseProvider from '../database/Database.Provider';
import UserModel from '../database/internal/models/User.Model';
import PartnerProfileModel from '../database/client/models/PartnerProfile.Model';
import PartnerEventModel from '../database/client/models/PartnerEvent.Model';
import PartnerListingEventModel from '../database/client/models/PartnerListingEvent.Model';
import ProductModel from '../database/client/models/Product.Model';
import EvidenceService from './EvidenceService';
import HttpError from '../../../shared/server/utils/HttpError';
import type { PartnerApplication, PartnerStatus } from '../../../shared/types/partner';

const PUBLIC_TO_OWNER = [
  'id',
  'userId',
  'status',
  'version',
  'application',
  'identityVerifiedAt',
  'bankVerifiedAt',
  'maxListings',
  'maxListingValueVnd',
  'createdAt',
  'updatedAt',
];
const fields: (keyof PartnerApplication)[] = [
  'legalName',
  'displayName',
  'phone',
  'pickupAddress',
  'experience',
  'bankName',
  'bankAccount',
  'accountHolder',
];
const text = (value: unknown, max = 500) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw HttpError.badRequest('Complete the seller application fields within their length limits.');
  return value.trim();
};
const application = (value: unknown): PartnerApplication => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw HttpError.badRequest('Complete the seller application.');
  const source = value as Record<string, unknown>;
  const result = Object.fromEntries(
    fields.map((key) => [key, text(source[key], key === 'experience' ? 1500 : 500)]),
  ) as unknown as PartnerApplication;
  if (!/^\+?[0-9 ()-]{8,20}$/.test(result.phone) || !/^[A-Za-z0-9 -]{4,50}$/.test(result.bankAccount))
    throw HttpError.badRequest('Check the contact phone and bank account.');
  return result;
};
const positive = (value: unknown, max: number) => {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > max)
    throw HttpError.badRequest('Enter a positive whole-number limit within the supported range.');
  return Number(value);
};

export default class PartnerService {
  private evidence = new EvidenceService();
  private async actor(userId: number, admin: boolean, transaction?: Transaction) {
    const user = await UserModel.findByPk(userId, { transaction });
    if (!user?.isActive || (admin && user.role !== 'ADMIN')) throw HttpError.forbidden();
    return user;
  }
  private async event(
    row: PartnerProfileModel,
    actorUserId: number,
    action: string,
    details: Record<string, unknown>,
    transaction: Transaction,
  ) {
    await PartnerEventModel.create(
      { partnerId: row.id, actorUserId, action, details: { version: row.version, ...details } },
      { transaction },
    );
  }
  async mine(userId: number) {
    await this.actor(userId, false);
    const row = await PartnerProfileModel.findOne({ where: { userId } });
    return row ? this.detail(row.id, userId) : null;
  }
  async list(actorUserId: number, offset = 0) {
    await this.actor(actorUserId, true);
    if (!Number.isSafeInteger(offset) || offset < 0) throw HttpError.badRequest('Invalid page offset.');
    const result = await PartnerProfileModel.findAndCountAll({
      attributes: PUBLIC_TO_OWNER.filter((field) => field !== 'application'),
      limit: 30,
      offset,
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
    });
    // Identity and bank details are loaded only when an authorized staff member opens the application.
    return { rows: result.rows, count: result.count };
  }
  async detail(id: number, actorUserId: number, admin = false) {
    await this.actor(actorUserId, admin);
    if (!Number.isSafeInteger(id) || id < 1) throw HttpError.notFound('Seller application not found.');
    const row = await PartnerProfileModel.findOne({
      where: { id, ...(admin ? {} : { userId: actorUserId }) },
      attributes: [...PUBLIC_TO_OWNER, 'currentEvidenceIds'],
    });
    if (!row) throw HttpError.notFound('Seller application not found.');
    const events = await PartnerEventModel.findAll({ where: { partnerId: id }, order: [['id', 'ASC']] });
    const { currentEvidenceIds, ...profile } = row.toJSON();
    return {
      ...profile,
      events,
      evidence: (await this.evidence.list(row.userId, 'partner_verification', id)).filter((file) =>
        currentEvidenceIds.includes(file.id),
      ),
    };
  }
  async submit(userId: number, body: Record<string, unknown>) {
    const values = application(body.application),
      key = text(body.requestKey, 128);
    if (body.termsAccepted !== true || !/^[A-Za-z0-9_.:-]{8,128}$/.test(key))
      throw HttpError.badRequest('Accept the verification and marketplace application terms.');
    if (!Array.isArray(body.evidenceIds) || body.evidenceIds.length < 1 || body.evidenceIds.length > 3)
      throw HttpError.badRequest('Attach 1–3 private identity verification photographs.');
    const digest = createHash('sha256')
      .update(
        JSON.stringify({
          application: values,
          evidenceIds: [...body.evidenceIds].sort((a, b) => Number(a) - Number(b)),
          termsAccepted: true,
        }),
      )
      .digest('hex');
    const id = await DatabaseProvider.getInstance().transaction(async (transaction) => {
      const user = await UserModel.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!user?.isActive || user.role !== 'USER') throw HttpError.forbidden();
      const existing = await PartnerProfileModel.findOne({
        where: { userId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (existing) {
        if (existing.requestKey === key && existing.requestDigest === digest) return existing.id;
        throw HttpError.conflict(
          'A seller application already exists. Revise that application when changes are requested.',
        );
      }
      const row = await PartnerProfileModel.create(
        { userId, requestKey: key, requestDigest: digest, application: values, currentEvidenceIds: body.evidenceIds },
        { transaction },
      );
      await this.evidence.bind(body.evidenceIds, userId, 'partner_verification', row.id, transaction);
      await this.event(
        row,
        userId,
        'submitted',
        { application: values, evidenceIds: body.evidenceIds, verificationConsent: true },
        transaction,
      );
      return row.id;
    });
    return this.detail(id, userId);
  }
  async act(id: number, actorUserId: number, body: Record<string, unknown>, admin = false) {
    await this.actor(actorUserId, admin);
    if (!Number.isSafeInteger(id) || id < 1) throw HttpError.notFound('Seller application not found.');
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      const row = await PartnerProfileModel.findOne({
        where: { id, ...(admin ? {} : { userId: actorUserId }) },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!row) throw HttpError.notFound('Seller application not found.');
      if (body.expectedVersion !== row.version)
        throw HttpError.conflict('The application changed. Review its current version.');
      if (!admin) {
        if (body.action !== 'revise' || !['submitted', 'changes_requested', 'rejected'].includes(row.status))
          throw HttpError.conflict('This application cannot be revised in its current state.');
        const values = application(body.application);
        if (
          body.termsAccepted !== true ||
          !Array.isArray(body.evidenceIds) ||
          body.evidenceIds.length < 1 ||
          body.evidenceIds.length > 3
        )
          throw HttpError.badRequest('Accept verification terms and attach 1–3 owned identity photographs.');
        await this.evidence.bind(body.evidenceIds, row.userId, 'partner_verification', id, transaction);
        await row.update(
          {
            application: values,
            currentEvidenceIds: body.evidenceIds,
            status: 'submitted',
            version: row.version + 1,
            identityVerifiedAt: null,
            bankVerifiedAt: null,
          },
          { transaction },
        );
        await this.event(
          row,
          actorUserId,
          'revised',
          { application: values, evidenceIds: body.evidenceIds, verificationConsent: true },
          transaction,
        );
        return;
      }
      const action = text(body.action, 40),
        reason = text(body.reason, 1000);
      const allowed: Record<string, PartnerStatus[]> = {
        request_changes: ['submitted'],
        verify: ['submitted'],
        reject: ['submitted'],
        restrict: ['verified'],
        suspend: ['verified', 'restricted'],
        restore: ['restricted', 'suspended'],
        close: ['submitted', 'changes_requested', 'rejected'],
      };
      if (!allowed[action]?.includes(row.status))
        throw HttpError.conflict('This review action is unavailable in the current application state.');
      const states: Record<string, PartnerStatus> = {
        request_changes: 'changes_requested',
        verify: 'verified',
        reject: 'rejected',
        restrict: 'restricted',
        suspend: 'suspended',
        restore: 'verified',
        close: 'closed',
      };
      const changes: Record<string, unknown> = { status: states[action], version: row.version + 1 };
      if (['verify', 'restrict', 'restore'].includes(action)) {
        changes.maxListings = positive(body.maxListings, 1000);
        changes.maxListingValueVnd = positive(body.maxListingValueVnd, 2147483647);
      }
      if (action === 'verify') {
        if (body.identityVerified !== true || body.bankVerified !== true)
          throw HttpError.badRequest('Confirm actual identity and matching account-holder verification separately.');
        changes.identityVerifiedAt = new Date();
        changes.bankVerifiedAt = new Date();
      }
      await row.update(changes, { transaction });
      if (action === 'suspend') {
        const listings = await ProductModel.findAll({ where: { partnerId:id,listingStatus:'published' },
          order:[['id','ASC']],transaction,lock:transaction.LOCK.UPDATE });
        for (const listing of listings) {
          await listing.update({listingStatus:'hidden',isArchived:true,listingVersion:listing.listingVersion+1},{transaction});
          await PartnerListingEventModel.create({productId:listing.id,partnerId:id,actorUserId,version:listing.listingVersion,
            action:'seller_suspended',details:{reason,sellerVersion:row.version}},{transaction});
        }
      }
      await this.event(
        row,
        actorUserId,
        action,
        {
          reason,
          ...changes,
          identityVerified: body.identityVerified === true,
          bankVerified: body.bankVerified === true,
        },
        transaction,
      );
    });
    return this.detail(id, actorUserId, admin);
  }
}
