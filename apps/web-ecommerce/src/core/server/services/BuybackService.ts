import crypto from 'crypto';
import { Transaction } from 'sequelize';
import DatabaseProvider from '../database/Database.Provider';
import BuybackRequestModel from '../database/client/models/BuybackRequest.Model';
import BuybackEventModel from '../database/client/models/BuybackEvent.Model';
import BuybackPayoutModel from '../database/client/models/BuybackPayout.Model';
import UserModel from '../database/internal/models/User.Model';
import HttpError from '../../../shared/server/utils/HttpError';
import type { BuybackAsset } from '../../../shared/types/buyback';
import { ASSEMBLY_STATES } from '../../../shared/gunpla';
import EvidenceService from './EvidenceService';
import CommercePolicyService from './CommercePolicyService';
import { activateOwnedCollectibleDraft } from './CollectibleIntakeService';
import MoneyReferenceService from './MoneyReferenceService';

const text = (value: unknown, field: string, max = 1500) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw HttpError.badRequest(`Provide ${field}, at most ${max} characters.`);
  return value.trim();
};
const amount = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 2147483647) throw HttpError.badRequest('Provide a positive whole VND amount.');
  return value;
};
const reference = (value: unknown) => {
  const valueText = text(value, 'actual transaction reference', 128).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9:/._-]{7,127}$/.test(valueText)) throw HttpError.badRequest('Use an actual 8–128 character transaction reference.');
  return valueText;
};

export default class BuybackService {
  private evidence = new EvidenceService();
  private policy = new CommercePolicyService();

  private async actor(id: number, admin: boolean, transaction?: Transaction) {
    const user = await UserModel.findByPk(id, { transaction });
    if (!user?.isActive || (admin && user.role !== 'ADMIN')) throw HttpError.forbidden();
  }
  private async locked(id: number, userId: number, admin: boolean, transaction: Transaction) {
    await this.actor(userId, admin, transaction);
    const row = await BuybackRequestModel.findOne({ where: { id, ...(admin ? {} : { userId }) }, transaction, lock: transaction.LOCK.UPDATE });
    if (!row) throw HttpError.notFound('Buyback request not found.');
    return row;
  }
  private current(row: BuybackRequestModel, expectedVersion: unknown) {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion !== row.version) throw HttpError.conflict('The request changed. Review its latest terms.');
  }
  private async event(row: BuybackRequestModel, actorUserId: number, action: string, details: Record<string, unknown>, transaction: Transaction) {
    await BuybackEventModel.create({ buybackRequestId: row.id, actorUserId, action, details: { version: row.version, ...details } }, { transaction });
  }
  async list(userId: number, admin = false) {
    await this.actor(userId, admin);
    return BuybackRequestModel.findAll({ where: admin ? {} : { userId }, attributes: { exclude: ['requestDigest', 'requestKey'] }, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: 100 });
  }
  async detail(id: number, userId: number, admin = false) {
    await this.actor(userId, admin);
    const row = await BuybackRequestModel.findOne({ where: { id, ...(admin ? {} : { userId }) }, attributes: { exclude: ['requestDigest', 'requestKey'] } });
    if (!row) throw HttpError.notFound('Buyback request not found.');
    const [events, evidence, payout] = await Promise.all([
      BuybackEventModel.findAll({ where: { buybackRequestId: id }, order: [['id', 'ASC']] }),
      this.evidence.list(row.userId, 'buyback', id),
      BuybackPayoutModel.findOne({ where: { buybackRequestId: id } }),
    ]);
    return { ...row.get({ plain: true }), events, evidence, payout };
  }
  async create(userId: number, data: Record<string, unknown>) {
    const requestKey = text(data.requestKey, 'request key', 128);
    if (!data.asset || typeof data.asset !== 'object' || Array.isArray(data.asset)) throw HttpError.badRequest('Provide the actual model identity and condition.');
    const input = data.asset as Record<string, unknown>, asset = {} as BuybackAsset;
    for (const key of ['name', 'modelCode', 'version', 'assemblyState', 'boxCondition', 'accessories', 'defects', 'repairHistory'] as const) asset[key] = text(input[key], key, key === 'name' ? 255 : 1500);
    if (!ASSEMBLY_STATES.includes(asset.assemblyState as typeof ASSEMBLY_STATES[number])) throw HttpError.badRequest('Invalid assembly state.');
    if (!Array.isArray(data.evidenceIds) || data.evidenceIds.length < 3) throw HttpError.badRequest('Provide at least three actual-item photographs, including sides and accessories.');
    const requestDigest = crypto.createHash('sha256').update(JSON.stringify({ asset, evidenceIds: data.evidenceIds })).digest('hex');
    const id = await DatabaseProvider.getInstance().transaction(async transaction => {
      await this.actor(userId, false, transaction);
      await DatabaseProvider.getInstance().query('SELECT pg_advisory_xact_lock(836208, hashtext(:key))', { replacements: { key: `${userId}:${requestKey}` }, transaction });
      const replay = await BuybackRequestModel.findOne({ where: { userId, requestKey }, transaction });
      if (replay) {
        if (replay.requestDigest !== requestDigest) throw HttpError.conflict('Request key was already used for different evidence or condition.');
        return replay.id;
      }
      const row = await BuybackRequestModel.create({ userId, requestKey, requestDigest, asset }, { transaction });
      const bound = await this.evidence.bind(data.evidenceIds, userId, 'buyback', row.id, transaction);
      if (new Set(bound.map(file => file.sha256)).size < 3) throw HttpError.badRequest('Upload at least three distinct views of the actual model.');
      await this.event(row, userId, 'submitted', { asset }, transaction);
      return row.id;
    });
    return this.detail(id, userId);
  }
  async act(id: number, userId: number, data: Record<string, unknown>, admin = false) {
    const action = text(data.action, 'action', 40);
    const staffActions = ['preliminary_offer', 'received', 'final_offer', 'return_offer', 'return_dispatched'];
    if (staffActions.includes(action) !== admin) throw HttpError.forbidden();
    await DatabaseProvider.getInstance().transaction(async transaction => {
      const row = await this.locked(id, userId, admin, transaction);
      this.current(row, data.expectedVersion);
      const details: Record<string, unknown> = {};
      switch (action) {
        case 'preliminary_offer': {
          if (!['submitted', 'quoted'].includes(row.status)) throw HttpError.conflict('A preliminary offer is available only before inbound delivery.');
          const offer = { amountVnd: amount(data.amountVnd), details: text(data.details, 'preliminary appraisal') };
          await row.update({ preliminaryOffer: offer, status: 'quoted' }, { transaction });
          details.offer = offer;
          break;
        }
        case 'send_item': {
          if (row.status !== 'quoted') throw HttpError.conflict('Review a preliminary appraisal before sending the model.');
          const policy = await this.policy.approved('buyback', transaction);
          if (data.inboundCod !== false) throw HttpError.badRequest('Inbound COD is not approved. Arrange a non-COD inspection shipment.');
          const inboundReference = text(data.inboundReference, 'inbound tracking or in-person handover reference', 255);
          await row.update({ status: 'awaiting_item', inboundReference, policyVersion: policy.version }, { transaction });
          Object.assign(details, { inboundReference, inboundCod: false, policyVersion: policy.version });
          break;
        }
        case 'received': {
          if (row.status !== 'awaiting_item' || data.handoverVerified !== true) throw HttpError.conflict('Verify physical receipt of the expected model.');
          const inspection = text(data.details, 'physical condition inspection');
          await row.update({ status: 'inspecting', inspection }, { transaction });
          details.inspection = inspection;
          break;
        }
        case 'final_offer': {
          if (!['inspecting', 'awaiting_acceptance'].includes(row.status) || !row.inspection) throw HttpError.conflict('Inspect the actual model before offering final terms.');
          const offer = { amountVnd: amount(data.amountVnd), details: text(data.details, 'final appraisal and revision reason') };
          await row.update({ status: 'awaiting_acceptance', finalOffer: offer }, { transaction });
          details.offer = offer;
          break;
        }
        case 'accept': {
          if (row.status !== 'awaiting_acceptance' || !row.finalOffer) throw HttpError.conflict('Accept only the current final inspected offer.');
          await row.update({ status: 'awaiting_payout' }, { transaction });
          details.acceptedOffer = row.finalOffer;
          break;
        }
        case 'reject': {
          if (row.status !== 'awaiting_acceptance') throw HttpError.conflict('There is no final offer awaiting your decision.');
          await row.update({ status: 'returning', returnTerms: null }, { transaction });
          details.reason = text(data.details, 'reason for rejecting the final offer');
          break;
        }
        case 'cancel': {
          if (['submitted', 'quoted'].includes(row.status)) await row.update({ status: 'cancelled' }, { transaction });
          else if (['awaiting_item', 'inspecting', 'awaiting_acceptance'].includes(row.status)) await row.update({ status: 'returning', returnTerms: null }, { transaction });
          else throw HttpError.conflict('This request cannot be cancelled.');
          details.reason = text(data.details, 'cancellation reason');
          break;
        }
        case 'return_offer': {
          if (row.status !== 'returning' || row.returnTerms?.accepted) throw HttpError.conflict('Return terms cannot change after acceptance.');
          const returnTerms = { details: text(data.details, 'return delivery and responsibility for shipping costs'), accepted: false, tracking: null };
          await row.update({ returnTerms }, { transaction });
          details.returnTerms = returnTerms;
          break;
        }
        case 'accept_return': {
          if (row.status !== 'returning' || !row.returnTerms || row.returnTerms.accepted) throw HttpError.conflict('Review the current return terms before accepting.');
          await row.update({ returnTerms: { ...row.returnTerms, accepted: true } }, { transaction });
          details.acceptedReturnTerms = row.returnTerms;
          break;
        }
        case 'return_dispatched': {
          if (row.status !== 'returning' || !row.returnTerms?.accepted || data.handoverVerified !== true) throw HttpError.conflict('Accepted return terms and actual handover are required.');
          const tracking = text(data.inboundReference, 'return shipment or handback reference', 255);
          await row.update({ status: 'cancelled', returnTerms: { ...row.returnTerms, tracking } }, { transaction });
          details.tracking = tracking;
          break;
        }
        default: throw HttpError.badRequest('Unsupported buyback action.');
      }
      await row.update({ version: row.version + 1 }, { transaction });
      await this.event(row, userId, action, details, transaction);
    });
    return this.detail(id, userId, admin);
  }
  async payout(id: number, userId: number, data: Record<string, unknown>) {
    const amountVnd = amount(data.amountVnd), externalReference = reference(data.externalReference), reason = text(data.details, 'payout verification');
    if (data.moneyVerified !== true) throw HttpError.badRequest('Verify the actual completed payout before ownership transfer.');
    await DatabaseProvider.getInstance().transaction(async transaction => {
      await this.actor(userId, true, transaction);
      await MoneyReferenceService.lock(externalReference, 'buyback_payout', transaction);
      await DatabaseProvider.getInstance().query('SELECT pg_advisory_xact_lock(836209, hashtext(:reference))', { replacements: { reference: externalReference }, transaction });
      const row = await this.locked(id, userId, true, transaction);
      const replay = await BuybackPayoutModel.findOne({ where: { externalReference }, transaction });
      if (replay) {
        if (replay.buybackRequestId !== id || replay.amountVnd !== amountVnd) throw HttpError.conflict('This transaction reference was allocated elsewhere.');
        return;
      }
      this.current(row, data.expectedVersion);
      if (row.status !== 'awaiting_payout' || !row.finalOffer || row.finalOffer.amountVnd !== amountVnd) throw HttpError.conflict('Pay the exact accepted final quote, once.');
      await BuybackPayoutModel.create({ buybackRequestId: id, actorUserId: userId, amountVnd, externalReference, reason }, { transaction });
      await row.update({ status: 'completed', ownershipTransferredAt: new Date(), version: row.version + 1 }, { transaction });
      await this.event(row, userId, 'payout', { amountVnd, externalReference, reason, acceptedOffer: row.finalOffer }, transaction);
    });
    return this.detail(id, userId, true);
  }
  async intake(id: number, userId: number, data: Record<string, unknown>) {
    if (!Number.isSafeInteger(data.productId) || Number(data.productId) < 1 || data.actualPhotosVerified !== true) throw HttpError.badRequest('Choose an actual shop-photographed draft SKU.');
    const productId = Number(data.productId), note = text(data.details, 'inspection-to-listing condition reconciliation');
    await DatabaseProvider.getInstance().transaction(async transaction => {
      const row = await this.locked(id, userId, true, transaction);
      if (row.productId) {
        if (row.productId !== productId) throw HttpError.conflict('The model already has a source-linked inventory intake.');
        return;
      }
      this.current(row, data.expectedVersion);
      if (row.status !== 'completed' || !row.ownershipTransferredAt || !row.finalOffer) throw HttpError.conflict('Confirmed payout and ownership must precede sellable stock.');
      const product = await activateOwnedCollectibleDraft(productId, row.asset.modelCode, row.finalOffer.amountVnd, transaction);
      await row.update({ productId, version: row.version + 1 }, { transaction });
      await this.event(row, userId, 'intake', { productId, sku: product.sku, condition: product.get({ plain: true }), note }, transaction);
    });
    return this.detail(id, userId, true);
  }
}
