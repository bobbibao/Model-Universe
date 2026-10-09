import { Op, type Transaction } from 'sequelize';
import DatabaseProvider from '../database/Database.Provider';
import PawnContractModel from '../database/client/models/PawnContract.Model';
import PawnEventModel from '../database/client/models/PawnEvent.Model';
import PawnDisposalEntryModel from '../database/client/models/PawnDisposalEntry.Model';
import OrderModel from '../database/client/models/Order.Model';
import OrderItemModel from '../database/client/models/OrderItem.Model';
import OrderReceiptModel from '../database/client/models/OrderReceipt.Model';
import OrderRefundModel from '../database/client/models/OrderRefund.Model';
import ReturnRequestModel from '../database/client/models/ReturnRequest.Model';
import EvidenceModel from '../database/client/models/Evidence.Model';
import UserModel from '../database/internal/models/User.Model';
import EvidenceService from './EvidenceService';
import MoneyReferenceService from './MoneyReferenceService';
import HttpError from '../../../shared/server/utils/HttpError';
import { pawnInterest } from '../../../shared/pawn-rules';
import { allocateVnd } from '../../../shared/money-allocation';
import { PAWN_DISPOSAL_RULE, type PawnDisposalCost, type PawnDisposalStatement } from '../../../shared/types/pawn-disposal';

const text = (value: unknown, label: string, max = 1500) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw HttpError.badRequest(`Provide ${label}, at most ${max} characters.`);
  return value.trim();
};
const money = (value: unknown, zero = false) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (zero ? 0 : 1) || value > 4294967294)
    throw HttpError.badRequest('Use a supported whole-VND amount.');
  return value;
};
const reference = (value: unknown) => {
  const result = text(value, 'actual bank transaction reference', 128).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9:/._-]{7,127}$/.test(result)) throw HttpError.badRequest('Use an actual 8–128 character bank reference.');
  return result;
};

// D6: actual collected proceeds -> documented accepted costs -> principal -> interest -> customer surplus.
// Original signed terms remain unchanged; each sale/revision needs a separately signed amendment.
export default class PawnDisposalService {
  private async actor(userId: number, admin: boolean, transaction?: Transaction) {
    const user = await UserModel.findByPk(userId, { transaction });
    if (!user?.isActive || (admin && user.role !== 'ADMIN')) throw HttpError.forbidden();
  }
  private async locked(id: number, userId: number, admin: boolean, expected: unknown, transaction: Transaction) {
    if (!Number.isSafeInteger(id) || id < 1) throw HttpError.badRequest('Invalid pawn contract.');
    await this.actor(userId, admin, transaction);
    const row = await PawnContractModel.findOne({ where: { id, ...(admin ? {} : { userId }) }, transaction, lock: transaction.LOCK.UPDATE });
    if (!row) throw HttpError.notFound();
    if (row.status !== 'disposed' || !row.disposedAt || !row.terms || !row.disbursedAt)
      throw HttpError.conflict('Only an explicitly disposed funded contract can be reconciled.', 'PAWN_DISPOSAL_REQUIRED');
    if (!Number.isSafeInteger(expected) || row.version !== expected)
      throw HttpError.conflict('Review the current pawn statement before acting.', 'PAWN_STATEMENT_STALE');
    return row;
  }
  private async event(row: PawnContractModel, actorUserId: number, action: string, details: Record<string, unknown>, transaction: Transaction) {
    await row.update({ version: row.version + 1 }, { transaction });
    await PawnEventModel.create({ pawnContractId: row.id, actorUserId, action, details: { version: row.version, ...details } }, { transaction });
  }
  private async entries(id: number, transaction?: Transaction) {
    return PawnDisposalEntryModel.findAll({ where: { pawnContractId: id }, order: [['id', 'ASC']], transaction });
  }
  private amounts(row: PawnContractModel, entries: PawnDisposalEntryModel[], now = new Date(), extra?: { amountVnd: number; costsVnd: number }) {
    const interestVnd = pawnInterest(row.terms!.principalVnd, row.terms!.policy, row.disbursedAt,
      row.disposalSettledAt || now).interestVnd;
    const proceedsVnd = entries.filter(entry => ['sale', 'sale_revision'].includes(entry.kind)).reduce((sum, entry) => sum + Number(entry.amountVnd), 0) + (extra?.amountVnd || 0);
    const costsVnd = entries.reduce((sum, entry) => sum + Number(entry.costsVnd), 0) + (extra?.costsVnd || 0);
    const repaymentsVnd = entries.filter(entry => entry.kind === 'repayment').reduce((sum, entry) => sum + Number(entry.amountVnd), 0);
    const surplusPaidVnd = entries.filter(entry => entry.kind === 'surplus').reduce((sum, entry) => sum + Number(entry.amountVnd), 0);
    const credit = proceedsVnd - costsVnd + repaymentsVnd - surplusPaidVnd;
    const principalAppliedVnd = Math.min(row.terms!.principalVnd, Math.max(0, credit));
    const interestAppliedVnd = Math.min(interestVnd, Math.max(0, credit - row.terms!.principalVnd));
    return { proceedsVnd, costsVnd, repaymentsVnd, surplusPaidVnd, principalAppliedVnd, interestAppliedVnd, interestVnd,
      remainingVnd: Math.max(0, row.terms!.principalVnd + interestVnd - credit),
      surplusVnd: Math.max(0, credit - row.terms!.principalVnd - interestVnd) };
  }
  // Order locks precede pawn locks, matching returns/refunds and preventing a sale/refund race.
  private async lockOrders(orderItemIds: number[], transaction: Transaction) {
    const items = orderItemIds.length ? await OrderItemModel.findAll({ where: { id: { [Op.in]: orderItemIds } }, transaction }) : [];
    const orderIds = [...new Set(items.map(item => item.orderId))].sort((a, b) => a - b);
    for (const orderId of orderIds) await OrderModel.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
  }
  private async sale(row: PawnContractModel, orderItemId: number, transaction?: Transaction) {
    const item = await OrderItemModel.findOne({ where: { id: orderItemId, productId: row.productId || -1 }, transaction });
    if (!item || item.quantity !== 1) throw HttpError.notFound('Choose the original sale of this source-linked unique model.');
    const order = await OrderModel.findByPk(item.orderId, { transaction });
    const receipt = await OrderReceiptModel.findOne({ where: { orderId: item.orderId }, transaction });
    if (!order || order.status !== 'DELIVERED' || order.paymentStatus !== 'PAID' || !receipt ||
        Number(receipt.amountVnd) + order.prepaidVnd !== order.total || new Date(receipt.createdAt) < row.disposedAt!)
      throw HttpError.conflict('Delivery and a verified complete sale receipt are required.', 'PAWN_SALE_UNCOLLECTED');
    const claims = await ReturnRequestModel.findAll({ where: { orderId: order.id, status: { [Op.ne]: 'REJECTED' } }, transaction });
    if (claims.some(claim => claim.resolutionStatus !== 'resolved'))
      throw HttpError.conflict('Resolve the buyer claim before applying proceeds or paying surplus.', 'PAWN_SALE_DISPUTED');
    const lines = await OrderItemModel.findAll({ where: { orderId: order.id }, transaction, order: [['id', 'ASC']] });
    if (lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) !== order.subtotal)
      throw HttpError.conflict('Reconcile the original sale merchandise totals first.', 'PAWN_SALE_UNCOLLECTED');
    const discounts = allocateVnd(order.discount, lines.map(line => ({ id: line.id, valueVnd: line.quantity * line.unitPrice })));
    const refunds = await OrderRefundModel.findAll({ where: { orderId: order.id }, order: [['id', 'ASC']], transaction });
    let refundedVnd = 0;
    for (const refund of refunds) {
      if (refund.lineRefunds) refundedVnd += refund.lineRefunds.filter(line => line.orderItemId === item.id).reduce((sum, line) => sum + line.merchandiseVnd, 0);
      else if (lines.length === 1) refundedVnd += refund.merchandiseVnd;
      else if (refund.merchandiseVnd > 0) throw HttpError.conflict('A retained mixed-order refund needs a reviewed line allocation before pawn accounting.', 'PAWN_REFUND_ALLOCATION_REQUIRED');
    }
    const netProceedsVnd = item.unitPrice - (discounts.get(item.id) || 0) - refundedVnd;
    if (netProceedsVnd < 0) throw HttpError.conflict('The source sale refund exceeds its net merchandise amount.');
    return { orderItemId, orderId: order.id, receiptId: receipt.id, receiptReference: receipt.externalReference,
      refundIds: refunds.map(refund => refund.id), netProceedsVnd };
  }
  private async reconciled(row: PawnContractModel, entries: PawnDisposalEntryModel[], transaction?: Transaction) {
    const latest = new Map<number, PawnDisposalEntryModel>();
    for (const entry of entries) if (entry.orderItemId) latest.set(entry.orderItemId, entry);
    for (const [id, entry] of latest) {
      const sale = await this.sale(row, id, transaction);
      if (!entry.statement || sale.netProceedsVnd !== entry.statement.netProceedsVnd ||
          JSON.stringify(sale.refundIds) !== JSON.stringify(entry.statement.refundIds))
        throw HttpError.conflict('Sale proceeds changed. Obtain consent to a revised statement before further financial action.', 'PAWN_SALE_RECONCILIATION_REQUIRED');
    }
  }
  async summary(row: PawnContractModel) {
    if (row.status !== 'disposed' || !row.terms || !row.disbursedAt) return null;
    const entries = await this.entries(row.id);
    let reconciliationRequired = false;
    try { await this.reconciled(row, entries); } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      reconciliationRequired = true;
    }
    const candidates = row.productId ? await OrderItemModel.findAll({ where: { productId: row.productId }, order: [['id', 'DESC']] }) : [];
    const sales = [];
    for (const candidate of candidates) {
      try { sales.push({ ...await this.sale(row, candidate.id), recorded: entries.some(entry => entry.orderItemId === candidate.id) }); }
      catch (error) { if (!(error instanceof HttpError)) throw error; }
    }
    const evidence = await EvidenceModel.findAll({ where: { purpose: 'pawn_settlement', entityId: row.id }, attributes: ['id', 'originalName'], order: [['id', 'ASC']] });
    return { ...this.amounts(row, entries), reconciliationRequired, sales, evidence,
      entries: entries.map(entry => ({ ...entry.get({ plain: true }), amountVnd: Number(entry.amountVnd), costsVnd: Number(entry.costsVnd) })) };
  }
  async offer(id: number, userId: number, data: Record<string, unknown>) {
    if (!Number.isSafeInteger(data.orderItemId) || Number(data.orderItemId) < 1 || !Array.isArray(data.costs) || data.costs.length > 12)
      throw HttpError.badRequest('Select a verified sale and at most twelve documented costs.');
    const inputs = data.costs as Record<string, unknown>[];
    await DatabaseProvider.getInstance().transaction(async transaction => {
      await this.lockOrders([Number(data.orderItemId)], transaction);
      const row = await this.locked(id, userId, true, data.expectedVersion, transaction);
      if (row.disposalStatement?.status === 'accepted') throw HttpError.conflict('The customer must withdraw an accepted amendment before changing it.');
      const sale = await this.sale(row, Number(data.orderItemId), transaction);
      const entries = await this.entries(id, transaction);
      const prior = entries.filter(entry => entry.orderItemId === sale.orderItemId).at(-1);
      if (prior && inputs.length) throw HttpError.badRequest('A proceeds correction cannot charge the original costs twice.');
      const costs: PawnDisposalCost[] = [];
      const seen = new Set<number>();
      for (const input of inputs) {
        if (!input || typeof input !== 'object' || !Number.isSafeInteger(input.evidenceId) || seen.has(Number(input.evidenceId)))
          throw HttpError.badRequest('Each cost needs its own original expense evidence.');
        seen.add(Number(input.evidenceId));
        const [file] = await new EvidenceService().bind([input.evidenceId], userId, 'pawn_settlement', id, transaction);
        if (costs.some(cost => cost.evidenceSha256 === file.sha256) || entries.some(entry => entry.statement?.costs.some(cost => cost.evidenceSha256 === file.sha256)))
          throw HttpError.badRequest('This documented expense is already included in the disposal accounting.');
        costs.push({ description: text(input.description, 'actual expense description', 255), amountVnd: money(input.amountVnd), evidenceId: file.id, evidenceSha256: file.sha256 });
      }
      const costsVnd = costs.reduce((sum, cost) => sum + cost.amountVnd, 0);
      if (costsVnd > sale.netProceedsVnd) throw HttpError.badRequest('Do not charge unapproved costs above the collected sale proceeds.');
      const previousProceedsVnd = prior?.statement?.netProceedsVnd || 0;
      const now = new Date();
      const amounts = this.amounts(row, entries, now, { amountVnd: sale.netProceedsVnd - previousProceedsVnd, costsVnd });
      const statement: PawnDisposalStatement = { ...sale, previousProceedsVnd, costs, rule: PAWN_DISPOSAL_RULE,
        status: 'offered', asOf: now.toISOString(), interestVnd: amounts.interestVnd,
        principalAppliedVnd: amounts.principalAppliedVnd, interestAppliedVnd: amounts.interestAppliedVnd,
        remainingVnd: amounts.remainingVnd, surplusVnd: amounts.surplusVnd,
        agreementText: text(data.agreementText, 'full disposal amendment including expense allocation and shortfall/surplus responsibilities', 5000),
        signatureEvidenceIds: [], payoutAccount: null };
      await row.update({ disposalStatement: statement }, { transaction });
      await this.event(row, userId, 'disposal_offered', { statement }, transaction);
    });
  }
  async decide(id: number, userId: number, data: Record<string, unknown>) {
    await DatabaseProvider.getInstance().transaction(async transaction => {
      const row = await this.locked(id, userId, false, data.expectedVersion, transaction);
      const statement = row.disposalStatement;
      if (!statement || !['accept', 'withdraw'].includes(String(data.decision))) throw HttpError.conflict('Review the current disposal amendment.');
      if (data.decision === 'withdraw') {
        await row.update({ disposalStatement: null }, { transaction });
        await this.event(row, userId, 'disposal_withdrawn', { statement, reason: text(data.details, 'withdrawal reason') }, transaction);
        return;
      }
      if (statement.status !== 'offered' || data.termsAccepted !== true || data.costsAccepted !== true)
        throw HttpError.badRequest('Accept the exact allocation, documented costs, debt and surplus terms.');
      const files = await new EvidenceService().bind(data.evidenceIds, userId, 'pawn_settlement', id, transaction);
      const previous = await PawnEventModel.findAll({ where: { pawnContractId: id, action: 'disposal_accepted' }, transaction });
      const previousIds = previous.flatMap(event => (event.details as { statement?: PawnDisposalStatement }).statement?.signatureEvidenceIds || []);
      const previousFiles = previousIds.length ? await EvidenceModel.findAll({ where: { id: { [Op.in]: previousIds } }, transaction }) : [];
      if (previousFiles.some(previous => files.some(next => next.sha256 === previous.sha256)))
        throw HttpError.badRequest('Upload fresh signed scans for the current amendment.');
      let payoutAccount = null;
      if (statement.surplusVnd > 0) payoutAccount = { bankName: text(data.bankName, 'receiving bank', 255),
        accountNumber: text(data.accountNumber, 'receiving account number', 128), holderName: text(data.holderName, 'receiving account holder', 255) };
      const accepted: PawnDisposalStatement = { ...statement, status: 'accepted', signatureEvidenceIds: files.map(file => file.id), payoutAccount };
      await row.update({ disposalStatement: accepted }, { transaction });
      await this.event(row, userId, 'disposal_accepted', { statement: accepted }, transaction);
    });
  }
  async execute(id: number, userId: number, data: Record<string, unknown>) {
    if (!Number.isSafeInteger(id) || id < 1) throw HttpError.badRequest('Invalid pawn contract.');
    await this.actor(userId, true);
    if (data.bilateralSignatureVerified !== true) throw HttpError.badRequest('Verify both signatures on the accepted current amendment.');
    const amendmentReference = text(data.amendmentReference, 'signed amendment reference', 255);
    await DatabaseProvider.getInstance().transaction(async transaction => {
      const initial = await PawnContractModel.findByPk(id, { transaction });
      if (!initial) throw HttpError.notFound();
      await this.lockOrders(initial.disposalStatement ? [initial.disposalStatement.orderItemId] : [], transaction);
      const row = await this.locked(id, userId, true, data.expectedVersion, transaction);
      const statement = row.disposalStatement;
      if (!statement || statement.status !== 'accepted' || !statement.signatureEvidenceIds.length)
        throw HttpError.conflict('The customer must accept and sign the current disposal statement first.');
      const sale = await this.sale(row, statement.orderItemId, transaction);
      const entries = await this.entries(id, transaction);
      const prior = entries.filter(entry => entry.orderItemId === sale.orderItemId).at(-1);
      if (sale.netProceedsVnd !== statement.netProceedsVnd || JSON.stringify(sale.refundIds) !== JSON.stringify(statement.refundIds) ||
          (prior?.statement?.netProceedsVnd || 0) !== statement.previousProceedsVnd)
        throw HttpError.conflict('The verified source proceeds changed. Obtain a revised signed statement.', 'PAWN_STATEMENT_STALE');
      const amountVnd = sale.netProceedsVnd - statement.previousProceedsVnd;
      const costsVnd = statement.costs.reduce((sum, cost) => sum + cost.amountVnd, 0);
      const now = new Date();
      const amounts = this.amounts(row, entries, now, { amountVnd, costsVnd });
      if (amounts.interestVnd !== statement.interestVnd)
        throw HttpError.conflict('Accrued interest crossed a day boundary. Withdraw and review the updated statement.', 'PAWN_STATEMENT_STALE');
      await PawnDisposalEntryModel.create({ pawnContractId: id, actorUserId: userId, kind: prior ? 'sale_revision' : 'sale',
        amountVnd, costsVnd, orderItemId: sale.orderItemId, receiptId: sale.receiptId, statement,
        reason: amendmentReference }, { transaction });
      await row.update({ disposalStatement: null,
        disposalSettledAt: row.disposalSettledAt || (amounts.remainingVnd === 0 ? now : null) }, { transaction });
      await this.event(row, userId, 'disposal_applied', { statement, amendmentReference, ...amounts }, transaction);
    });
  }
  async payment(id: number, userId: number, data: Record<string, unknown>, kind: 'repayment' | 'surplus') {
    if (!Number.isSafeInteger(id) || id < 1) throw HttpError.badRequest('Invalid pawn contract.');
    await this.actor(userId, true);
    if (data.moneyVerified !== true) throw HttpError.badRequest('Verify the actual completed bank transaction.');
    const amountVnd = money(data.amountVnd), externalReference = reference(data.externalReference), reason = text(data.details, 'actual bank verification');
    await DatabaseProvider.getInstance().transaction(async transaction => {
      await this.actor(userId, true, transaction);
      await MoneyReferenceService.lock(externalReference, 'pawn_disposal_entry', transaction);
      const previous = await PawnDisposalEntryModel.findOne({ where: { externalReference }, transaction });
      if (previous) {
        if (previous.pawnContractId !== id || previous.kind !== kind || Number(previous.amountVnd) !== amountVnd)
          throw HttpError.conflict('This bank transaction already belongs to another payment.');
        return;
      }
      const entries = await this.entries(id, transaction);
      await this.lockOrders(entries.filter(entry => entry.orderItemId).map(entry => entry.orderItemId!), transaction);
      const row = await this.locked(id, userId, true, data.expectedVersion, transaction);
      // Reload after the domain lock: another account action may have committed while this transaction waited.
      const currentEntries = await this.entries(id, transaction);
      await this.reconciled(row, currentEntries, transaction);
      if (!currentEntries.some(entry => entry.kind === 'sale') || row.disposalStatement)
        throw HttpError.conflict('Complete the signed sale allocation before accepting debt or paying surplus.');
      const now = new Date(), amounts = this.amounts(row, currentEntries, now);
      const maximum = kind === 'repayment' ? amounts.remainingVnd : amounts.surplusVnd;
      if (maximum < 1 || amountVnd > maximum || (kind === 'surplus' && amountVnd !== maximum))
        throw HttpError.conflict('Verify an eligible outstanding repayment or the exact remaining surplus.', 'PAWN_PAYMENT_AMOUNT_INVALID');
      let payoutAccount = null;
      if (kind === 'surplus') {
        payoutAccount = [...currentEntries].reverse().find(entry => entry.statement?.payoutAccount)?.statement?.payoutAccount;
        if (!payoutAccount || data.receivingAccountVerified !== true)
          throw HttpError.badRequest('Verify payment to the customer-approved account in the signed statement.');
      }
      await PawnDisposalEntryModel.create({ pawnContractId: id, actorUserId: userId, kind, amountVnd,
        externalReference, reason }, { transaction });
      const after = this.amounts(row, [...currentEntries, { kind, amountVnd, costsVnd: 0 } as PawnDisposalEntryModel], now);
      await row.update({ disposalSettledAt: row.disposalSettledAt || (after.remainingVnd === 0 ? now : null) }, { transaction });
      await this.event(row, userId, kind === 'repayment' ? 'disposal_repaid' : 'disposal_surplus_paid',
        { amountVnd, externalReference, reason, payoutAccount, ...after }, transaction);
    });
  }
}
