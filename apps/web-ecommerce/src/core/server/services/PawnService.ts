import crypto from 'crypto';
import { Transaction, UniqueConstraintError } from 'sequelize';
import DatabaseProvider from '../database/Database.Provider';
import PawnContractModel from '../database/client/models/PawnContract.Model';
import PawnEventModel from '../database/client/models/PawnEvent.Model';
import PawnPaymentModel from '../database/client/models/PawnPayment.Model';
import EvidenceModel from '../database/client/models/Evidence.Model';
import UserModel from '../database/internal/models/User.Model';
import HttpError from '../../../shared/server/utils/HttpError';
import { ASSEMBLY_STATES } from '../../../shared/gunpla';
import type { BuybackAsset } from '../../../shared/types/buyback';
import type { PawnTerms } from '../../../shared/types/pawn';
import { PAWN_DAY_MS, pawnInterest, validatePawnPolicy, validatePawnPrincipal } from '../../../shared/pawn-rules';
import EvidenceService from './EvidenceService';
import CommercePolicyService from './CommercePolicyService';
import MoneyReferenceService from './MoneyReferenceService';
import { activateOwnedCollectibleDraft } from './CollectibleIntakeService';
import CommerceNotificationModel from '../database/client/models/CommerceNotification.Model';

const text = (value: unknown, label: string, max = 1500) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw HttpError.badRequest(`Provide ${label}, at most ${max} characters.`);
  return value.trim();
};
const reference = (value: unknown) => {
  const result = text(value, 'actual transaction reference', 128).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9:/._-]{7,127}$/.test(result)) throw HttpError.badRequest('Use an actual 8–128 character transaction reference.');
  return result;
};
const amount = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 4294967294) throw HttpError.badRequest('Provide a positive whole VND amount.');
  return value;
};

export default class PawnService {
  private evidence = new EvidenceService();
  private policy = new CommercePolicyService();
  private async actor(userId: number, admin: boolean, transaction?: Transaction) {
    const user = await UserModel.findByPk(userId, { transaction });
    if (!user?.isActive || (admin && user.role !== 'ADMIN')) throw HttpError.forbidden();
  }
  private async locked(id: number, userId: number, admin: boolean, transaction: Transaction) {
    if (!Number.isSafeInteger(id) || id < 1) throw HttpError.badRequest('Invalid pawn request ID.');
    await this.actor(userId, admin, transaction);
    const row = await PawnContractModel.findOne({ where: { id, ...(admin ? {} : { userId }) }, transaction, lock: transaction.LOCK.UPDATE });
    if (!row) throw HttpError.notFound('Pawn request not found.');
    return row;
  }
  private current(row: PawnContractModel, expected: unknown) {
    if (!Number.isSafeInteger(expected) || expected !== row.version) throw HttpError.conflict('Review the latest contract version before deciding.');
  }
  private async event(row: PawnContractModel, actorUserId: number, action: string, details: Record<string, unknown>, transaction: Transaction) {
    await PawnEventModel.create({ pawnContractId: row.id, actorUserId, action, details: { version: row.version, ...details } }, { transaction });
  }
  private async estimate(row: PawnContractModel, asOf = new Date(), transaction?: Transaction) {
    const collectedVnd = Number(await PawnPaymentModel.sum('amountVnd', { where: { pawnContractId: row.id, kind: 'redemption' }, transaction }) || 0);
    if (!row.terms || !row.disbursedAt) return { asOf, days: 0, interestVnd: 0, capped: false, collectedVnd, remainingVnd: 0 };
    const stop = row.handbackAt || (row.terms.policy.interestStopEvent === 'verified_repayment' ? row.paidAt : null) || asOf;
    const interest = pawnInterest(row.terms.principalVnd, row.terms.policy, row.disbursedAt, stop);
    return { asOf, ...interest, collectedVnd, remainingVnd: Math.max(0, row.terms.principalVnd + interest.interestVnd - collectedVnd) };
  }
  async list(userId: number, admin = false) {
    await this.actor(userId, admin);
    const rows = await PawnContractModel.findAll({ where: admin ? {} : { userId }, attributes: { exclude: ['requestKey', 'requestDigest'] }, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: 100 });
    return rows.map(row => ({ ...row.get({ plain: true }), overdue: row.status === 'active' && !!row.dueAt && row.dueAt < new Date() }));
  }
  async detail(id: number, userId: number, admin = false) {
    if (!Number.isSafeInteger(id) || id < 1) throw HttpError.badRequest('Invalid pawn request ID.');
    await this.actor(userId, admin);
    const row = await PawnContractModel.findOne({ where: { id, ...(admin ? {} : { userId }) }, attributes: { exclude: ['requestKey', 'requestDigest'] } });
    if (!row) throw HttpError.notFound('Pawn request not found.');
    const [events, evidence, payments, estimate] = await Promise.all([
      PawnEventModel.findAll({ where: { pawnContractId: id }, order: [['id', 'ASC']] }),
      this.evidence.list(row.userId, 'pawn', id),
      PawnPaymentModel.findAll({ where: { pawnContractId: id }, order: [['id', 'ASC']] }),
      this.estimate(row),
    ]);
    return { ...row.get({ plain: true }), overdue: row.status === 'active' && !!row.dueAt && row.dueAt < new Date(), events, evidence, estimate, payments: payments.map(payment => ({ ...payment.get({ plain: true }), amountVnd: Number(payment.amountVnd), principalVnd: Number(payment.principalVnd), interestVnd: Number(payment.interestVnd) })) };
  }
  async notifications(userId: number) {
    await this.actor(userId, false);
    return CommerceNotificationModel.findAll({ where: { userId, kind: ['pawn_due', 'pawn_overdue'] }, order: [['createdAt', 'DESC']], limit: 50 });
  }
  async create(userId: number, data: Record<string, unknown>) {
    const requestKey = text(data.requestKey, 'request key', 128);
    if (!data.asset || typeof data.asset !== 'object' || Array.isArray(data.asset)) throw HttpError.badRequest('Describe the actual model and condition.');
    const input = data.asset as Record<string, unknown>, asset = {} as BuybackAsset;
    for (const key of ['name', 'modelCode', 'version', 'assemblyState', 'boxCondition', 'accessories', 'defects', 'repairHistory'] as const) asset[key] = text(input[key], key, key === 'name' ? 255 : 1500);
    if (!ASSEMBLY_STATES.includes(asset.assemblyState as typeof ASSEMBLY_STATES[number])) throw HttpError.badRequest('Invalid assembly state.');
    if (!Array.isArray(data.evidenceIds) || data.evidenceIds.length < 3) throw HttpError.badRequest('Provide at least three distinct actual-item photographs.');
    const requestDigest = crypto.createHash('sha256').update(JSON.stringify({ asset, evidenceIds: data.evidenceIds })).digest('hex');
    const id = await DatabaseProvider.getInstance().transaction(async transaction => {
      await this.actor(userId, false, transaction);
      await DatabaseProvider.getInstance().query('SELECT pg_advisory_xact_lock(836211, hashtext(:key))', { replacements: { key: `${userId}:${requestKey}` }, transaction });
      const replay = await PawnContractModel.findOne({ where: { userId, requestKey }, transaction });
      if (replay) {
        if (replay.requestDigest !== requestDigest) throw HttpError.conflict('The request key belongs to another model or evidence set.');
        return replay.id;
      }
      const row = await PawnContractModel.create({ userId, requestKey, requestDigest, asset }, { transaction });
      const evidence = await this.evidence.bind(data.evidenceIds, userId, 'pawn', row.id, transaction);
      if (new Set(evidence.map(file => file.sha256)).size < 3) throw HttpError.badRequest('Provide three distinct model views.');
      await this.event(row, userId, 'submitted', { asset }, transaction);
      return row.id;
    });
    return this.detail(id, userId);
  }
  async act(id: number, userId: number, data: Record<string, unknown>, admin = false) {
    const action = text(data.action, 'action', 40);
    const staffActions = ['quote', 'confirm_contract', 'receive_asset', 'extension_decision', 'handback', 'dispose'];
    if (staffActions.includes(action) !== admin) throw HttpError.forbidden();
    await DatabaseProvider.getInstance().transaction(async transaction => {
      const row = await this.locked(id, userId, admin, transaction);
      this.current(row, data.expectedVersion);
      const details: Record<string, unknown> = {};
      switch (action) {
        case 'quote': {
          if (row.disbursedAt || !['submitted', 'quoted', 'accepted', 'contract_confirmed', 'in_custody'].includes(row.status)) throw HttpError.conflict('Disbursed contract terms cannot be changed.');
          const approved = await this.policy.approved('pawn', transaction);
          let policy;
          try { policy = validatePawnPolicy(approved.settings); validatePawnPrincipal(Number(data.appraisalVnd), Number(data.principalVnd)); }
          catch (error) { throw HttpError.badRequest((error as Error).message); }
          if (typeof data.appraisalVnd !== 'number' || typeof data.principalVnd !== 'number' || !Number.isInteger(data.termDays) || Number(data.termDays) < 1 || Number(data.termDays) > 365 || typeof data.disposalAfterGrace !== 'boolean') throw HttpError.badRequest('Choose explicit appraisal, principal, term and disposal terms.');
          const terms: PawnTerms = { appraisalVnd: data.appraisalVnd, principalVnd: data.principalVnd, termDays: Number(data.termDays), contractText: text(data.details, 'full contract, extension and disposal conditions', 5000), disposalAfterGrace: data.disposalAfterGrace, policyVersion: approved.version, policy };
          await row.update({ terms, status: 'quoted', contractReference: null, contractEvidenceIds: [] }, { transaction });
          details.terms = terms;
          break;
        }
        case 'accept': {
          if (row.status !== 'quoted' || !row.terms || data.termsAccepted !== true || data.disposalTermsAccepted !== row.terms.disposalAfterGrace) throw HttpError.conflict('Accept the exact current interest, term and disposal agreement.');
          await row.update({ status: 'accepted' }, { transaction });
          details.acceptedTerms = row.terms;
          break;
        }
        case 'attach_contract': {
          if (row.status !== 'accepted' || row.contractEvidenceIds.length) throw HttpError.conflict('Upload the signed current agreement after accepting its terms.');
          const prior = await EvidenceModel.findAll({ where: { ownerUserId: userId, purpose: 'pawn', entityId: id }, transaction });
          if (!Array.isArray(data.evidenceIds) || data.evidenceIds.some(fileId => prior.some(file => file.id === fileId))) throw HttpError.badRequest('Upload separate scans of the signed current contract.');
          const files = await this.evidence.bind(data.evidenceIds, userId, 'pawn', id, transaction);
          const contractEvidenceIds = files.map(file => file.id);
          await row.update({ contractEvidenceIds }, { transaction });
          details.contractEvidenceIds = contractEvidenceIds;
          break;
        }
        case 'confirm_contract': {
          if (row.status !== 'accepted' || !row.contractEvidenceIds.length || data.bilateralSignatureVerified !== true) throw HttpError.conflict('Verify both signatures on the uploaded current agreement first.');
          const contractReference = text(data.contractReference, 'signed contract reference', 255);
          await row.update({ status: row.custodyAt ? 'in_custody' : 'contract_confirmed', contractReference }, { transaction });
          Object.assign(details, { contractReference, terms: row.terms, contractEvidenceIds: row.contractEvidenceIds });
          break;
        }
        case 'receive_asset': {
          if (row.status !== 'contract_confirmed' || data.handoverVerified !== true || data.conditionMatchesAgreement !== true) throw HttpError.conflict('Verify physical custody and condition against the signed agreement. Revise mismatched terms before disbursement.');
          const custodyReference = text(data.custodyReference, 'actual asset custody tag / receipt reference', 255);
          if (await PawnContractModel.findOne({ where: { custodyReference }, transaction })) throw HttpError.conflict('This custody reference already belongs to a pledged asset.');
          await row.update({ status: 'in_custody', custodyAt: new Date(), custodyReference }, { transaction });
          details.inspection = text(data.details, 'actual handover and condition inspection');
          details.custodyReference = custodyReference;
          break;
        }
        case 'request_extension': {
          if (row.status !== 'active' || !row.dueAt || row.extensionRequest) throw HttpError.conflict('An active contract can have one pending extension request.');
          const due = new Date(text(data.proposedDueAt, 'proposed due date', 50));
          if (!Number.isFinite(due.getTime()) || due <= row.dueAt || due.getTime() > row.dueAt.getTime() + 365 * PAWN_DAY_MS) throw HttpError.badRequest('Request a later due date, at most one additional year.');
          const extensionRequest = { proposedDueAt: due.toISOString(), reason: text(data.details, 'extension reason') };
          await row.update({ extensionRequest }, { transaction });
          details.extensionRequest = extensionRequest;
          break;
        }
        case 'extension_decision': {
          if (row.status !== 'active' || !row.extensionRequest || typeof data.accepted !== 'boolean') throw HttpError.conflict('Review the current extension request.');
          Object.assign(details, { oldDueAt: row.dueAt, request: row.extensionRequest, accepted: data.accepted, reason: text(data.details, 'extension decision reason') });
          await row.update({ dueAt: data.accepted ? new Date(row.extensionRequest.proposedDueAt) : row.dueAt, extensionRequest: null }, { transaction });
          details.newDueAt = row.dueAt;
          break;
        }
        case 'handback': {
          const refundableCustody = !row.disbursedAt && ['quoted', 'accepted', 'contract_confirmed', 'in_custody'].includes(row.status);
          if (data.handoverVerified !== true || !row.custodyAt || !(row.status === 'repaid' || refundableCustody)) throw HttpError.conflict('Verify the actual asset handback after repayment or before disbursement.');
          const estimate = await this.estimate(row, new Date(), transaction);
          if (row.disbursedAt && estimate.remainingVnd !== 0) throw HttpError.conflict('Additional accrued interest must be reconciled under the accepted stop-event policy before handback.');
          details.reason = text(data.details, 'actual asset handback record');
          details.settlement = estimate;
          await row.update({ status: row.disbursedAt ? 'returned' : 'cancelled', handbackAt: new Date() }, { transaction });
          break;
        }
        case 'dispose': {
          const now = new Date();
          if (row.status !== 'active' || !row.terms?.disposalAfterGrace || !row.dueAt || row.extensionRequest || now.getTime() <= row.dueAt.getTime() + row.terms.policy.graceDays * PAWN_DAY_MS || data.authorized !== true || data.contractEligibilityVerified !== true) throw HttpError.conflict('Disposal requires an overdue eligible signed contract, reviewed extensions and explicit authorized verification. Interest cap alone never authorizes disposal.');
          Object.assign(details, { reason: text(data.details, 'contractual disposal eligibility and authorized decision', 5000), disposalReference: text(data.disposalReference, 'actual disposal authorization reference', 255), terms: row.terms, settlement: await this.estimate(row, now, transaction) });
          await row.update({ status: 'disposed', disposedAt: now }, { transaction });
          break;
        }
        case 'cancel': {
          if (row.disbursedAt || row.custodyAt || !['submitted', 'quoted', 'accepted', 'contract_confirmed'].includes(row.status)) throw HttpError.conflict('Custody requires an actual handback; disbursed contracts require redemption or contractual resolution.');
          details.reason = text(data.details, 'cancellation reason');
          await row.update({ status: 'cancelled' }, { transaction });
          break;
        }
        default: throw HttpError.badRequest('Unsupported pawn action.');
      }
      await row.update({ version: row.version + 1 }, { transaction });
      await this.event(row, userId, action, details, transaction);
    }).catch(error => {
      if (error instanceof UniqueConstraintError) throw HttpError.conflict('The contract or custody reference already belongs to another pledged asset.');
      throw error;
    });
    return this.detail(id, userId, admin);
  }
  async payment(id: number, userId: number, data: Record<string, unknown>, kind: 'disbursement' | 'redemption') {
    const amountVnd = amount(data.amountVnd), externalReference = reference(data.externalReference), reason = text(data.details, 'actual payment verification');
    if (data.moneyVerified !== true) throw HttpError.badRequest('Verify the actual completed bank transaction.');
    await DatabaseProvider.getInstance().transaction(async transaction => {
      await this.actor(userId, true, transaction);
      await MoneyReferenceService.lock(externalReference, 'pawn_payment', transaction);
      const row = await this.locked(id, userId, true, transaction);
      const existing = await PawnPaymentModel.findOne({ where: { externalReference }, transaction });
      if (existing) {
        if (existing.pawnContractId !== id || existing.kind !== kind || Number(existing.amountVnd) !== amountVnd) throw HttpError.conflict('This transaction reference belongs to another payment.');
        return;
      }
      this.current(row, data.expectedVersion);
      if (!row.terms || !row.contractReference || !row.custodyAt) throw HttpError.conflict('Signed accepted terms and physical custody are required first.');
      const now = new Date();
      let principalVnd = 0, interestVnd = 0;
      if (kind === 'disbursement') {
        if (row.status !== 'in_custody' || row.disbursedAt || amountVnd !== row.terms.principalVnd) throw HttpError.conflict('Disburse the exact signed principal once after custody verification.');
        principalVnd = amountVnd;
        await row.update({ status: 'active', disbursedAt: now, dueAt: new Date(now.getTime() + row.terms.termDays * PAWN_DAY_MS) }, { transaction });
      } else {
        if (!['active', 'repaid'].includes(row.status) || !row.disbursedAt) throw HttpError.conflict('Only a disbursed contract can receive redemption payment.');
        const estimate = await this.estimate(row, now, transaction);
        if (amountVnd !== estimate.remainingVnd || estimate.remainingVnd < 1) throw HttpError.conflict('Verify the exact currently outstanding redemption amount; reload an estimate that crossed a day boundary.');
        principalVnd = row.paidAt ? 0 : row.terms.principalVnd;
        interestVnd = amountVnd - principalVnd;
        await row.update({ status: 'repaid', paidAt: row.paidAt || now }, { transaction });
      }
      await PawnPaymentModel.create({ pawnContractId: id, actorUserId: userId, kind, amountVnd, principalVnd, interestVnd, externalReference, reason }, { transaction });
      await row.update({ version: row.version + 1 }, { transaction });
      await this.event(row, userId, kind, { amountVnd, principalVnd, interestVnd, externalReference, reason, dueAt: row.dueAt, policy: row.terms.policy }, transaction);
    });
    return this.detail(id, userId, true);
  }
  async intake(id: number, userId: number, data: Record<string, unknown>) {
    if (!Number.isSafeInteger(data.productId) || Number(data.productId) < 1 || data.actualPhotosVerified !== true) throw HttpError.badRequest('Choose an actual shop-photographed draft SKU.');
    const productId = Number(data.productId), reason = text(data.details, 'disposal-to-listing condition reconciliation');
    await DatabaseProvider.getInstance().transaction(async transaction => {
      const row = await this.locked(id, userId, true, transaction);
      if (row.productId) {
        if (row.productId !== productId) throw HttpError.conflict('This disposed asset already has source-linked inventory.');
        return;
      }
      this.current(row, data.expectedVersion);
      if (row.status !== 'disposed' || !row.disposedAt || !row.terms || !row.disbursedAt) throw HttpError.conflict('Verified eligible contractual disposal must precede sellable inventory.');
      const product = await activateOwnedCollectibleDraft(productId, row.asset.modelCode, row.terms.principalVnd, transaction);
      await row.update({ productId, version: row.version + 1 }, { transaction });
      await this.event(row, userId, 'intake', { productId, sku: product.sku, condition: product.get({ plain: true }), reason, acquisitionCostBasis: 'disbursed_principal' }, transaction);
    });
    return this.detail(id, userId, true);
  }
}
