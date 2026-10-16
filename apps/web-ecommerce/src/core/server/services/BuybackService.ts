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
import ProductModel from '../database/client/models/Product.Model';
import EvidenceModel from '../database/client/models/Evidence.Model';
import { isVideo } from './EvidenceService';
import NotificationDispatchService from './NotificationDispatchService';
import { emailBuybackQuote, emailBuybackReceived } from './delivery/Messages';
import {
  compareInspection,
  estimateBuyback,
  isBuybackIssueType,
  MAX_ISSUE_QUANTITY,
  type BuybackIssue,
} from '../../../shared/buyback-pricing';
import { memberPrice } from '../../../shared/pricing';

// A request's customer-facing code (the specification's buyback_code).
export const buybackCode = (id: number) => `TM${id}`;

// Issues as the customer declares them or staff record them: a known type, a count and a description.
export const parseIssues = (raw: unknown, field = 'issues'): BuybackIssue[] => {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > 30) throw HttpError.badRequest(`Provide at most 30 ${field}.`);
  return raw.map((entry) => {
    const value = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    if (!isBuybackIssueType(value.type)) throw HttpError.badRequest('Choose a known issue type.');
    const quantity = value.quantity;
    if (
      typeof quantity !== 'number' ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_ISSUE_QUANTITY
    )
      throw HttpError.badRequest(`Each issue count must be 1–${MAX_ISSUE_QUANTITY}.`);
    const description = typeof value.description === 'string' ? value.description.trim().slice(0, 500) : '';
    if (value.type === 'other' && !description) throw HttpError.badRequest('Describe every "other" issue.');
    return { type: value.type, quantity, description };
  });
};

// The reference price is the shop's actual member selling price S (price after the standard 10% voucher) of the same
// catalog model: the pricing rules 4.0 forbid using the list price R in buyback rules.
const referenceFor = (product: ProductModel | null) => (product ? memberPrice(product.price) : null);

const text = (value: unknown, field: string, max = 1500) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw HttpError.badRequest(`Provide ${field}, at most ${max} characters.`);
  return value.trim();
};
const amount = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 2147483647)
    throw HttpError.badRequest('Provide a positive whole VND amount.');
  return value;
};
const reference = (value: unknown) => {
  const valueText = text(value, 'actual transaction reference', 128).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9:/._-]{7,127}$/.test(valueText))
    throw HttpError.badRequest('Use an actual 8–128 character transaction reference.');
  return valueText;
};

export default class BuybackService {
  private evidence = new EvidenceService();
  private policy = new CommercePolicyService();
  private notices = new NotificationDispatchService();

  private async actor(id: number, admin: boolean, transaction?: Transaction) {
    const user = await UserModel.findByPk(id, { transaction });
    if (!user?.isActive || (admin && user.role !== 'ADMIN')) throw HttpError.forbidden();
  }
  private async locked(id: number, userId: number, admin: boolean, transaction: Transaction) {
    await this.actor(userId, admin, transaction);
    const row = await BuybackRequestModel.findOne({
      where: { id, ...(admin ? {} : { userId }) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!row) throw HttpError.notFound('Buyback request not found.');
    return row;
  }
  private current(row: BuybackRequestModel, expectedVersion: unknown) {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion !== row.version)
      throw HttpError.conflict('The request changed. Review its latest terms.');
  }
  private async event(
    row: BuybackRequestModel,
    actorUserId: number,
    action: string,
    details: Record<string, unknown>,
    transaction: Transaction,
  ) {
    await BuybackEventModel.create(
      { buybackRequestId: row.id, actorUserId, action, details: { version: row.version, ...details } },
      { transaction },
    );
  }
  async list(userId: number, admin = false) {
    await this.actor(userId, admin);
    return BuybackRequestModel.findAll({
      where: admin ? {} : { userId },
      attributes: { exclude: ['requestDigest', 'requestKey'] },
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: 100,
    });
  }
  async detail(id: number, userId: number, admin = false) {
    await this.actor(userId, admin);
    const row = await BuybackRequestModel.findOne({
      where: { id, ...(admin ? {} : { userId }) },
      attributes: { exclude: ['requestDigest', 'requestKey'] },
    });
    if (!row) throw HttpError.notFound('Buyback request not found.');
    const [events, evidence, inspectionEvidence, payout, product] = await Promise.all([
      BuybackEventModel.findAll({ where: { buybackRequestId: id }, order: [['id', 'ASC']] }),
      this.evidence.list(row.userId, 'buyback', id),
      this.evidence.listForEntity('buyback_inspection', id),
      BuybackPayoutModel.findOne({ where: { buybackRequestId: id } }),
      row.referenceProductId
        ? ProductModel.findByPk(row.referenceProductId, { attributes: ['id', 'name', 'sku', 'price'] })
        : null,
    ]);
    const referenceProduct = product
      ? { id: product.id, name: product.name, sku: product.sku, priceVnd: product.price }
      : null;
    return {
      ...row.get({ plain: true }),
      code: buybackCode(row.id),
      events,
      evidence,
      inspectionEvidence,
      payout,
      referenceProduct,
    };
  }
  async create(userId: number, data: Record<string, unknown>) {
    const requestKey = text(data.requestKey, 'request key', 128);
    if (!data.asset || typeof data.asset !== 'object' || Array.isArray(data.asset))
      throw HttpError.badRequest('Provide the actual model identity and condition.');
    const input = data.asset as Record<string, unknown>,
      asset = {} as BuybackAsset;
    for (const key of [
      'name',
      'modelCode',
      'version',
      'assemblyState',
      'boxCondition',
      'accessories',
      'defects',
      'repairHistory',
    ] as const)
      asset[key] = text(input[key], key, key === 'name' ? 255 : 1500);
    if (!ASSEMBLY_STATES.includes(asset.assemblyState as (typeof ASSEMBLY_STATES)[number]))
      throw HttpError.badRequest('Invalid assembly state.');
    if (!Array.isArray(data.evidenceIds) || data.evidenceIds.length < 3)
      throw HttpError.badRequest('Provide at least three actual-item photographs, including sides and accessories.');
    // The customer confirms the declaration is honest and that the displayed price is only an estimate (§21).
    if (data.confirmations !== true)
      throw HttpError.badRequest(
        'Confirm the declaration and the inspection terms before sending.',
        undefined,
        'CONFIRMATION_REQUIRED',
      );
    const declaredIssues = parseIssues(data.declaredIssues, 'declared issues');
    const referenceProductId =
      data.referenceProductId === undefined || data.referenceProductId === null
        ? null
        : Number(data.referenceProductId);
    if (referenceProductId !== null && (!Number.isSafeInteger(referenceProductId) || referenceProductId < 1))
      throw HttpError.badRequest('Choose a catalog model or leave it empty.');
    const seriousDamage = data.seriousDamage === true;
    const requestDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({ asset, evidenceIds: data.evidenceIds, declaredIssues, referenceProductId, seriousDamage }),
      )
      .digest('hex');
    const id = await DatabaseProvider.getInstance().transaction(async (transaction) => {
      await this.actor(userId, false, transaction);
      await DatabaseProvider.getInstance().query('SELECT pg_advisory_xact_lock(836208, hashtext(:key))', {
        replacements: { key: `${userId}:${requestKey}` },
        transaction,
      });
      const replay = await BuybackRequestModel.findOne({ where: { userId, requestKey }, transaction });
      if (replay) {
        if (replay.requestDigest !== requestDigest)
          throw HttpError.conflict('Request key was already used for different evidence or condition.');
        return replay.id;
      }
      // Only the shop's own catalog prices count; a model outside the catalog is priced manually (§16).
      const product = referenceProductId
        ? await ProductModel.findOne({ where: { id: referenceProductId, partnerId: null }, transaction })
        : null;
      if (referenceProductId && !product) throw HttpError.notFound('Catalog model not found.');
      const estimate = estimateBuyback(referenceFor(product), declaredIssues, { seriousDamage });
      const row = await BuybackRequestModel.create(
        { userId, requestKey, requestDigest, asset, referenceProductId, declaredIssues, estimate },
        { transaction },
      );
      const bound = await this.evidence.bind(data.evidenceIds, userId, 'buyback', row.id, transaction);
      const files = await EvidenceModel.findAll({ where: { id: bound.map((file) => file.id) }, transaction });
      const photos = files.filter((file) => !isVideo(file.mimeType));
      if (new Set(photos.map((file) => file.sha256)).size < 3)
        throw HttpError.badRequest('Upload at least three distinct photographs of the actual model.');
      // Minimum media check (§19, §24): a video of the whole model, and a close-up photo for every declared issue.
      const missing: string[] = [];
      if (!files.some((file) => isVideo(file.mimeType))) missing.push('Video quay toàn bộ sản phẩm, part và phụ kiện.');
      if (declaredIssues.length && photos.length < 3 + 1) missing.push('Ảnh cận cảnh các lỗi đã khai báo.');
      if (missing.length)
        await row.update({ status: 'need_more_evidence', evidenceRequest: missing.join('\n') }, { transaction });
      await this.event(
        row,
        userId,
        'submitted',
        { asset, declaredIssues, estimate, missingEvidence: missing },
        transaction,
      );
      return row.id;
    });
    return this.detail(id, userId);
  }
  async act(id: number, userId: number, data: Record<string, unknown>, admin = false) {
    const action = text(data.action, 'action', 40);
    const staffActions = [
      'request_evidence',
      'preliminary_offer',
      'received',
      'final_offer',
      'return_offer',
      'return_dispatched',
    ];
    let notify: ((transaction: Transaction, row: BuybackRequestModel) => Promise<void>) | null = null;
    if (staffActions.includes(action) !== admin) throw HttpError.forbidden();
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      const row = await this.locked(id, userId, admin, transaction);
      this.current(row, data.expectedVersion);
      const details: Record<string, unknown> = {};
      switch (action) {
        case 'request_evidence': {
          if (!['submitted', 'need_more_evidence'].includes(row.status))
            throw HttpError.conflict('More evidence can be requested only before the preliminary quote.');
          const evidenceRequest = text(data.details, 'the photos or videos still needed');
          await row.update({ status: 'need_more_evidence', evidenceRequest }, { transaction });
          details.evidenceRequest = evidenceRequest;
          notify = async (tx, current) => {
            await this.notices.notifyCustomer(
              {
                userId: current.userId,
                kind: 'buyback_need_evidence',
                entityId: current.id,
                dedupeKey: `buyback:${current.id}:evidence:${current.version}`,
                details: { code: buybackCode(current.id), request: evidenceRequest },
              },
              tx,
            );
          };
          break;
        }
        case 'add_evidence': {
          if (row.status !== 'need_more_evidence')
            throw HttpError.conflict('The shop has not asked for more evidence.');
          const bound = await this.evidence.bind(data.evidenceIds, row.userId, 'buyback', row.id, transaction);
          await row.update({ status: 'submitted' }, { transaction });
          details.evidenceIds = bound.map((file) => file.id);
          details.note = typeof data.details === 'string' ? data.details.slice(0, 1500) : undefined;
          break;
        }
        case 'preliminary_offer': {
          if (!['submitted', 'quoted', 'need_more_evidence'].includes(row.status))
            throw HttpError.conflict('A preliminary offer is available only before inbound delivery.');
          const formula = row.estimate?.manualReview ? null : (row.estimate?.estimateVnd ?? null);
          // Without an amount the 2.0 formula estimate is offered; any other amount is a manual price with its reason.
          const amountVnd = data.amountVnd === undefined || data.amountVnd === null ? formula : amount(data.amountVnd);
          if (amountVnd === null)
            throw HttpError.badRequest(
              'This model needs a manual preliminary price.',
              undefined,
              'MANUAL_PRICE_REQUIRED',
            );
          const offer = {
            amountVnd,
            details: text(data.details, 'preliminary appraisal'),
            basis: amountVnd === formula ? ('formula' as const) : ('manual' as const),
          };
          await row.update({ preliminaryOffer: offer, status: 'quoted', evidenceRequest: null }, { transaction });
          details.offer = offer;
          notify = async (tx, current) => {
            await this.notices.notifyCustomer(
              {
                userId: current.userId,
                kind: 'buyback_preliminary_quote',
                entityId: current.id,
                dedupeKey: `buyback:${current.id}:preliminary:${current.version}`,
                details: { code: buybackCode(current.id), amountVnd },
              },
              tx,
            );
          };
          break;
        }
        case 'send_item': {
          if (row.status !== 'quoted')
            throw HttpError.conflict('Review a preliminary appraisal before sending the model.');
          const policy = await this.policy.approved('buyback', transaction);
          if (data.inboundCod !== false)
            throw HttpError.badRequest('Inbound COD is not approved. Arrange a non-COD inspection shipment.');
          const inboundReference = text(data.inboundReference, 'inbound tracking or in-person handover reference', 255);
          await row.update(
            { status: 'awaiting_item', inboundReference, policyVersion: policy.version },
            { transaction },
          );
          Object.assign(details, { inboundReference, inboundCod: false, policyVersion: policy.version });
          break;
        }
        case 'received': {
          if (row.status !== 'awaiting_item' || data.handoverVerified !== true)
            throw HttpError.conflict('Verify physical receipt of the expected model.');
          const inspection = text(data.details, 'physical condition inspection');
          await row.update({ status: 'inspecting', inspection }, { transaction });
          details.inspection = inspection;
          notify = async (tx, current) => {
            const user = await UserModel.findByPk(current.userId, { transaction: tx });
            const receivedAt = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
            await this.notices.notifyCustomer(
              {
                userId: current.userId,
                kind: 'buyback_received',
                entityId: current.id,
                dedupeKey: `buyback:${current.id}:received`,
                details: { code: buybackCode(current.id), productName: current.asset.name },
                email: emailBuybackReceived(
                  buybackCode(current.id),
                  user ? `${user.lastName} ${user.firstName}`.trim() : '',
                  current.asset.name,
                  receivedAt,
                  current.preliminaryOffer?.amountVnd ?? current.estimate?.estimateVnd ?? null,
                ),
              },
              tx,
            );
          };
          break;
        }
        case 'final_offer': {
          if (!['inspecting', 'awaiting_acceptance', 'reinspection_requested'].includes(row.status) || !row.inspection)
            throw HttpError.conflict('Inspect the actual model before offering final terms.');
          // Every inspection is recorded on video/photos kept as evidence (§25-§27).
          if (Array.isArray(data.inspectionEvidenceIds) && data.inspectionEvidenceIds.length)
            await this.evidence.bind(data.inspectionEvidenceIds, userId, 'buyback_inspection', row.id, transaction);
          if (!(await EvidenceModel.count({ where: { purpose: 'buyback_inspection', entityId: row.id }, transaction })))
            throw HttpError.conflict(
              'Attach the unboxing and inspection recording before the final quote.',
              'INSPECTION_EVIDENCE_REQUIRED',
            );
          const inspectedIssues = parseIssues(data.inspectedIssues, 'inspected issues');
          const comparison = compareInspection(row.declaredIssues || [], inspectedIssues);
          const reference = row.estimate?.referencePriceVnd ?? null;
          const formulaEstimate = estimateBuyback(reference, inspectedIssues, {
            seriousDamage: data.seriousDamage === true,
          });
          const formula = formulaEstimate.manualReview ? null : formulaEstimate.estimateVnd;
          const amountVnd = data.amountVnd === undefined || data.amountVnd === null ? formula : amount(data.amountVnd);
          if (amountVnd === null)
            throw HttpError.badRequest(
              'This model needs a manual final price with its reason.',
              undefined,
              'MANUAL_PRICE_REQUIRED',
            );
          const offer = {
            amountVnd,
            details: text(data.details, 'final appraisal and revision reason'),
            basis: amountVnd === formula ? ('formula' as const) : ('manual' as const),
          };
          await row.update(
            { status: 'awaiting_acceptance', finalOffer: offer, inspectedIssues, comparison, reviewRequest: null },
            { transaction },
          );
          Object.assign(details, { offer, inspectedIssues, comparison });
          notify = async (tx, current) => {
            const user = await UserModel.findByPk(current.userId, { transaction: tx });
            const estimateVnd = current.preliminaryOffer?.amountVnd ?? current.estimate?.estimateVnd ?? null;
            await this.notices.notifyCustomer(
              {
                userId: current.userId,
                kind:
                  comparison.newIssueCount || comparison.resolvedIssueCount
                    ? 'buyback_final_quote_adjusted'
                    : 'buyback_final_quote',
                entityId: current.id,
                dedupeKey: `buyback:${current.id}:final:${current.version}`,
                details: {
                  code: buybackCode(current.id),
                  amountVnd,
                  estimateVnd,
                  newIssueCount: comparison.newIssueCount,
                  resolvedIssueCount: comparison.resolvedIssueCount,
                  deductionDifferenceVnd: comparison.deductionDifferenceVnd,
                },
                email: emailBuybackQuote(
                  buybackCode(current.id),
                  user ? `${user.lastName} ${user.firstName}`.trim() : '',
                  {
                    estimateVnd,
                    declaredIssueCount: comparison.declaredIssueCount,
                    inspectedIssueCount: comparison.inspectedIssueCount,
                    deductionDifferenceVnd: comparison.deductionDifferenceVnd,
                    finalVnd: amountVnd,
                  },
                ),
              },
              tx,
            );
          };
          break;
        }
        case 'request_review': {
          // The customer disputes the inspected issues; nothing can be accepted until staff answer (§39).
          if (row.status !== 'awaiting_acceptance') throw HttpError.conflict('There is no final offer to review.');
          const reviewRequest = text(data.details, 'which recorded issues you dispute and why');
          await row.update({ status: 'reinspection_requested', reviewRequest }, { transaction });
          details.reason = reviewRequest;
          break;
        }
        case 'accept': {
          if (row.status !== 'awaiting_acceptance' || !row.finalOffer)
            throw HttpError.conflict('Accept only the current final inspected offer.');
          await row.update({ status: 'awaiting_payout' }, { transaction });
          details.acceptedOffer = row.finalOffer;
          break;
        }
        case 'reject': {
          if (!['awaiting_acceptance', 'reinspection_requested'].includes(row.status))
            throw HttpError.conflict('There is no final offer awaiting your decision.');
          await row.update({ status: 'returning', returnTerms: null }, { transaction });
          details.reason = text(data.details, 'reason for rejecting the final offer');
          break;
        }
        case 'cancel': {
          if (['submitted', 'quoted'].includes(row.status)) await row.update({ status: 'cancelled' }, { transaction });
          else if (row.status === 'need_more_evidence') await row.update({ status: 'cancelled' }, { transaction });
          else if (
            ['awaiting_item', 'inspecting', 'awaiting_acceptance', 'reinspection_requested'].includes(row.status)
          )
            await row.update({ status: 'returning', returnTerms: null }, { transaction });
          else throw HttpError.conflict('This request cannot be cancelled.');
          details.reason = text(data.details, 'cancellation reason');
          break;
        }
        case 'return_offer': {
          if (row.status !== 'returning' || row.returnTerms?.accepted)
            throw HttpError.conflict('Return terms cannot change after acceptance.');
          const returnTerms = {
            details: text(data.details, 'return delivery and responsibility for shipping costs'),
            accepted: false,
            tracking: null,
          };
          await row.update({ returnTerms }, { transaction });
          details.returnTerms = returnTerms;
          break;
        }
        case 'accept_return': {
          if (row.status !== 'returning' || !row.returnTerms || row.returnTerms.accepted)
            throw HttpError.conflict('Review the current return terms before accepting.');
          await row.update({ returnTerms: { ...row.returnTerms, accepted: true } }, { transaction });
          details.acceptedReturnTerms = row.returnTerms;
          break;
        }
        case 'return_dispatched': {
          if (row.status !== 'returning' || !row.returnTerms?.accepted || data.handoverVerified !== true)
            throw HttpError.conflict('Accepted return terms and actual handover are required.');
          const tracking = text(data.inboundReference, 'return shipment or handback reference', 255);
          await row.update({ status: 'cancelled', returnTerms: { ...row.returnTerms, tracking } }, { transaction });
          details.tracking = tracking;
          break;
        }
        default:
          throw HttpError.badRequest('Unsupported buyback action.');
      }
      await row.update({ version: row.version + 1 }, { transaction });
      await this.event(row, userId, action, details, transaction);
      if (notify) await notify(transaction, row);
    });
    this.notices.dispatchSoon();
    return this.detail(id, userId, admin);
  }
  async payout(id: number, userId: number, data: Record<string, unknown>) {
    const amountVnd = amount(data.amountVnd),
      externalReference = reference(data.externalReference),
      reason = text(data.details, 'payout verification');
    if (data.moneyVerified !== true)
      throw HttpError.badRequest('Verify the actual completed payout before ownership transfer.');
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      await this.actor(userId, true, transaction);
      await MoneyReferenceService.lock(externalReference, 'buyback_payout', transaction);
      await DatabaseProvider.getInstance().query('SELECT pg_advisory_xact_lock(836209, hashtext(:reference))', {
        replacements: { reference: externalReference },
        transaction,
      });
      const row = await this.locked(id, userId, true, transaction);
      const replay = await BuybackPayoutModel.findOne({ where: { externalReference }, transaction });
      if (replay) {
        if (replay.buybackRequestId !== id || replay.amountVnd !== amountVnd)
          throw HttpError.conflict('This transaction reference was allocated elsewhere.');
        return;
      }
      this.current(row, data.expectedVersion);
      if (row.status !== 'awaiting_payout' || !row.finalOffer || row.finalOffer.amountVnd !== amountVnd)
        throw HttpError.conflict('Pay the exact accepted final quote, once.');
      await BuybackPayoutModel.create(
        { buybackRequestId: id, actorUserId: userId, amountVnd, externalReference, reason },
        { transaction },
      );
      await row.update(
        { status: 'completed', ownershipTransferredAt: new Date(), version: row.version + 1 },
        { transaction },
      );
      await this.event(
        row,
        userId,
        'payout',
        { amountVnd, externalReference, reason, acceptedOffer: row.finalOffer },
        transaction,
      );
    });
    return this.detail(id, userId, true);
  }
  async intake(id: number, userId: number, data: Record<string, unknown>) {
    if (!Number.isSafeInteger(data.productId) || Number(data.productId) < 1 || data.actualPhotosVerified !== true)
      throw HttpError.badRequest('Choose an actual shop-photographed draft SKU.');
    const productId = Number(data.productId),
      note = text(data.details, 'inspection-to-listing condition reconciliation');
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      const row = await this.locked(id, userId, true, transaction);
      if (row.productId) {
        if (row.productId !== productId)
          throw HttpError.conflict('The model already has a source-linked inventory intake.');
        return;
      }
      this.current(row, data.expectedVersion);
      if (row.status !== 'completed' || !row.ownershipTransferredAt || !row.finalOffer)
        throw HttpError.conflict('Confirmed payout and ownership must precede sellable stock.');
      const product = await activateOwnedCollectibleDraft(
        productId,
        row.asset.modelCode,
        row.finalOffer.amountVnd,
        transaction,
      );
      await row.update({ productId, version: row.version + 1 }, { transaction });
      await this.event(
        row,
        userId,
        'intake',
        { productId, sku: product.sku, condition: product.get({ plain: true }), note },
        transaction,
      );
    });
    return this.detail(id, userId, true);
  }
}

// Customer estimate before submitting (POST /buyback/estimate): the same arithmetic the server stores.
export const estimateFor = async (data: Record<string, unknown>) => {
  const issues = parseIssues(data.declaredIssues, 'declared issues');
  const id =
    data.referenceProductId === undefined || data.referenceProductId === null ? null : Number(data.referenceProductId);
  const product =
    id && Number.isSafeInteger(id) ? await ProductModel.findOne({ where: { id, partnerId: null } }) : null;
  return {
    referenceProduct: product
      ? { id: product.id, name: product.name, sku: product.sku, listPriceVnd: product.price }
      : null,
    estimate: estimateBuyback(referenceFor(product), issues, { seriousDamage: data.seriousDamage === true }),
  };
};
