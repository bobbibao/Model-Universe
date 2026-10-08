import crypto from 'crypto';
import MoneyReferenceService from './MoneyReferenceService';
import { Op, Transaction } from 'sequelize';
import DatabaseProvider from '../database/Database.Provider';
import UserModel from '../database/internal/models/User.Model';
import OrderModel from '../database/client/models/Order.Model';
import OrderRefundModel from '../database/client/models/OrderRefund.Model';
import ReturnRequestModel from '../database/client/models/ReturnRequest.Model';
import CouponModel from '../database/client/models/Coupon.Model';
import ProductModel, { isSellable } from '../database/client/models/Product.Model';
import LoyaltyLedgerModel from '../database/client/models/LoyaltyLedger.Model';
import LoyaltyClaimModel from '../database/client/models/LoyaltyClaim.Model';
import LoyaltyGiftModel from '../database/client/models/LoyaltyGift.Model';
import LoyaltyRedemptionModel from '../database/client/models/LoyaltyRedemption.Model';
import CommercePolicyModel from '../database/client/models/CommercePolicy.Model';
import CommercePolicyService from './CommercePolicyService';
import EvidenceService from './EvidenceService';
import HttpError from '../../../shared/server/utils/HttpError';
import {
  LOYALTY_REWARDS,
  LOYALTY_TIERS,
  loyaltyBalances,
  pointsForNetMerchandise,
} from '../../../shared/loyalty-rules';
import { validateShipping } from '../../../shared/server/utils/ShippingValidation';

const reference = (value: unknown) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9:_.-]{8,128}$/.test(value.trim()))
    throw HttpError.badRequest('Enter an 8–128 character transaction reference.');
  return value.trim().toUpperCase();
};
const amount = (value: unknown, positive = true) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (positive ? 1 : 0) || value > 2147483647)
    throw HttpError.badRequest('Enter a valid whole VND amount.');
  return value;
};
const reason = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000)
    throw HttpError.badRequest('A reason of at most 1,000 characters is required.');
  return value.trim();
};

export default class LoyaltyService {
  private policies = new CommercePolicyService();
  private async member(userId: number, transaction: Transaction) {
    const user = await UserModel.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user?.isActive) throw HttpError.forbidden();
    return user;
  }
  private async admin(userId: number, transaction: Transaction) {
    const user = await UserModel.findByPk(userId, { transaction });
    if (!user?.isActive || user.role !== 'ADMIN') throw HttpError.forbidden();
  }
  async balances(userId: number, transaction?: Transaction) {
    return loyaltyBalances(await LoyaltyLedgerModel.findAll({ where: { userId }, transaction }));
  }
  async memberDiscount(
    userId: number,
    lines: { listPrice: number; salePrice: number; quantity: number }[],
    transaction?: Transaction,
  ) {
    const policy = await this.policies.approved('loyalty', transaction);
    if (transaction) await this.member(userId, transaction);
    if (lines.some((line) => line.salePrice < line.listPrice))
      throw HttpError.conflict(
        'Choose either sale prices or your member tier; benefits cannot be combined.',
        'BENEFIT_CONFLICT',
      );
    const { tier } = await this.balances(userId, transaction);
    const subtotal = lines.reduce((sum, line) => sum + line.salePrice * line.quantity, 0);
    return {
      discount: Math.round((subtotal * tier.discountPercent) / 100),
      snapshot: { kind: 'tier', tier: tier.name, discountPercent: tier.discountPercent, policyVersion: policy.version },
    };
  }
  async overview(userId: number) {
    const policy = await CommercePolicyModel.findOne({ where: { name: 'loyalty' }, order: [['version', 'DESC']] });
    const [balances, history, wallet, claims, gifts] = await Promise.all([
      this.balances(userId),
      LoyaltyLedgerModel.findAll({ where: { userId }, order: [['id', 'DESC']], limit: 100 }),
      LoyaltyRedemptionModel.findAll({ where: { userId }, order: [['id', 'DESC']], limit: 100 }),
      LoyaltyClaimModel.findAll({ where: { userId }, order: [['id', 'DESC']], limit: 100 }),
      LoyaltyGiftModel.findAll({ where: { isActive: true }, order: [['id', 'ASC']] }),
    ]);
    const couponIds = wallet.flatMap((item) => (item.couponId ? [item.couponId] : []));
    const coupons = couponIds.length
      ? await CouponModel.findAll({ where: { id: { [Op.in]: couponIds }, ownerUserId: userId } })
      : [];
    const byId = new Map(coupons.map((coupon) => [coupon.id, coupon]));
    const giftProducts = gifts.length
      ? await ProductModel.findAll({ where: { id: { [Op.in]: gifts.map((gift) => gift.productId) } } })
      : [];
    const giftStock = new Map(giftProducts.map((product) => [product.id, isSellable(product) && product.stock > 0]));
    return {
      active: !!policy,
      policyVersion: policy?.version || null,
      balances,
      tiers: LOYALTY_TIERS,
      rewards: LOYALTY_REWARDS,
      gifts: gifts.map((gift) => ({ ...gift.get({ plain: true }), available: giftStock.get(gift.productId) === true })),
      history,
      claims,
      wallet: wallet.map((item) => ({ ...item.get({ plain: true }), coupon: byId.get(item.couponId || 0) || null })),
    };
  }

  // The caller already owns the order lock. Never replay historic completed orders implicitly on migration.
  async reconcileOrder(order: OrderModel, actorUserId: number, transaction: Transaction) {
    const policy = await CommercePolicyModel.findOne({
      where: { name: 'loyalty' },
      order: [['version', 'DESC']],
      transaction,
    });
    if (!policy) return;
    if (!(await UserModel.findByPk(order.userId, { transaction, lock: transaction.LOCK.UPDATE })))
      throw HttpError.notFound();
    const entries = await LoyaltyLedgerModel.findAll({ where: { userId: order.userId }, transaction });
    const source = `order:${order.id}`;
    const awarded = entries
      .filter((entry) => entry.details.orderId === order.id && ['earn', 'reverse'].includes(entry.kind))
      .reduce((sum, entry) => sum + entry.lifetimeDelta, 0);
    const refunds =
      Number(await OrderRefundModel.sum('merchandiseVnd', { where: { orderId: order.id }, transaction })) || 0;
    const disputed = await ReturnRequestModel.count({
      where: {
        orderId: order.id,
        status: { [Op.ne]: 'REJECTED' },
        [Op.or]: [
          { status: 'REQUESTED', resolutionStatus: null },
          { resolutionStatus: { [Op.in]: ['pending', 'offered', 'accepted', 'rejected'] } },
        ],
      },
      transaction,
    });
    if (
      order.status !== 'DELIVERED' ||
      order.paymentStatus !== 'PAID' ||
      (disputed && !entries.some((entry) => entry.sourceReference === source))
    )
      return;
    const eligibleVnd = Math.max(0, order.subtotal - order.discount - refunds);
    const target = pointsForNetMerchandise(eligibleVnd),
      delta = target - awarded;
    const original = entries.some((entry) => entry.sourceReference === source);
    if (!original || delta !== 0)
      await LoyaltyLedgerModel.create(
        {
          userId: order.userId,
          actorUserId,
          sourceReference: original ? `${source}:net:${eligibleVnd}` : source,
          kind: original ? 'reverse' : 'earn',
          balanceDelta: delta,
          lifetimeDelta: delta,
          usedDelta: 0,
          policyVersion: policy.version,
          reason: original
            ? 'Verified cumulative merchandise refunds recalculated eligible points.'
            : 'Paid delivered purchase with no open return dispute.',
          details: { orderId: order.id, eligibleVnd },
        },
        { transaction },
      );
  }

  async redeem(userId: number, data: Record<string, unknown>) {
    const key = reference(data.requestKey),
      rewardKey = String(data.rewardKey || '');
    const reward = LOYALTY_REWARDS.find((item) => item.key === rewardKey);
    const giftId = /^gift-\d+$/.test(rewardKey) ? Number(rewardKey.slice(5)) : null;
    if (!reward && !giftId) throw HttpError.badRequest('Choose a configured reward.');
    return DatabaseProvider.getInstance().transaction(async (transaction) => {
      const policy = await this.policies.approved('loyalty', transaction);
      const gift = giftId ? await LoyaltyGiftModel.findByPk(giftId, { transaction }) : null;
      const product = gift
        ? await ProductModel.findByPk(gift.productId, { transaction, lock: transaction.LOCK.UPDATE })
        : null;
      await this.member(userId, transaction);
      const existing = await LoyaltyRedemptionModel.findOne({ where: { userId, requestKey: key }, transaction });
      if (existing) {
        if (existing.rewardKey !== rewardKey)
          throw HttpError.conflict('This redemption reference belongs to another reward.');
        return existing;
      }
      if (giftId && (!gift?.isActive || !product || !isSellable(product) || product.stock < 1))
        throw HttpError.conflict('The gift is no longer available.');
      const pointsCost = reward?.points || gift!.pointsCost;
      if ((await this.balances(userId, transaction)).available < pointsCost)
        throw HttpError.conflict('You do not have enough available points.');
      const snapshot = reward
        ? { ...reward, policyVersion: policy.version }
        : {
            kind: 'gift',
            productId: product!.id,
            sku: product!.sku,
            name: product!.name,
            imageUrl: product!.imageUrl,
            titleEn: gift!.titleEn,
            titleVi: gift!.titleVi,
            points: pointsCost,
            policyVersion: policy.version,
          };
      let coupon: CouponModel | null = null;
      if (reward)
        coupon = await CouponModel.create(
          {
            code: `MU-${crypto.randomBytes(10).toString('hex').toUpperCase()}`,
            title: 'Model Universe member reward',
            source: 'loyalty',
            ownerUserId: userId,
            discountPercent: reward.kind === 'percent' ? reward.amount : 0,
            fixedAmountVnd: reward.kind === 'fixed' ? reward.amount : 0,
            maxDiscountVnd: reward.maxDiscountVnd,
            minOrderVnd: reward.minOrderVnd,
            usageLimit: 1,
            usageCount: 0,
            isActive: true,
            startDate: new Date(),
            expirationDate: new Date(Date.now() + Number(policy.settings.voucherExpiryDays) * 86400000),
            policySnapshot: policy.get({ plain: true }),
          },
          { transaction },
        );
      if (product) await product.update({ stock: product.stock - 1 }, { transaction });
      const redemption = await LoyaltyRedemptionModel.create(
        {
          userId,
          requestKey: key,
          rewardKey,
          pointsCost,
          rewardSnapshot: snapshot,
          couponId: coupon?.id || null,
          giftProductId: product?.id || null,
        },
        { transaction },
      );
      await LoyaltyLedgerModel.create(
        {
          userId,
          actorUserId: userId,
          sourceReference: `redemption:${redemption.id}`,
          kind: 'redeem',
          balanceDelta: -pointsCost,
          lifetimeDelta: 0,
          usedDelta: pointsCost,
          policyVersion: policy.version,
          reason: 'Customer redeemed an owned reward.',
          details: { redemptionId: redemption.id, rewardKey },
        },
        { transaction },
      );
      return redemption;
    });
  }

  async submitClaim(userId: number, data: Record<string, unknown>) {
    const transactionReference = reference(data.transactionReference),
      claimedVnd = amount(data.claimedVnd),
      date = new Date(String(data.transactionDate));
    if (!Number.isFinite(date.getTime()) || date > new Date())
      throw HttpError.badRequest('Choose the actual past transaction date.');
    return DatabaseProvider.getInstance().transaction(async (transaction) => {
      await this.member(userId, transaction);
      const existing = await LoyaltyClaimModel.findOne({ where: { userId, transactionReference }, transaction });
      if (existing) {
        if (existing.claimedVnd !== claimedVnd || existing.transactionDate.getTime() !== date.getTime())
          throw HttpError.conflict('This transaction reference belongs to a different submitted claim.');
        return existing;
      }
      const claim = await LoyaltyClaimModel.create(
        {
          userId,
          transactionReference,
          transactionDate: date,
          claimedVnd,
          note: typeof data.note === 'string' ? data.note.slice(0, 1000) : null,
        },
        { transaction },
      );
      await new EvidenceService().bind(data.evidenceIds, userId, 'loyalty_claim', claim.id, transaction);
      return claim;
    });
  }
  async claimDetail(id: number, actorUserId: number, isAdmin = false) {
    const claim = await LoyaltyClaimModel.findOne({ where: { id, ...(isAdmin ? {} : { userId: actorUserId }) } });
    if (!claim) throw HttpError.notFound();
    if (isAdmin)
      await DatabaseProvider.getInstance().transaction((transaction) => this.admin(actorUserId, transaction));
    return {
      ...claim.get({ plain: true }),
      evidence: await new EvidenceService().list(claim.userId, 'loyalty_claim', claim.id),
    };
  }
  async reviewClaim(id: number, actorUserId: number, data: Record<string, unknown>) {
    const reviewReason = reason(data.reason);
    if (!['approved', 'rejected'].includes(String(data.decision)))
      throw HttpError.badRequest('Choose a claim decision.');
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      await this.admin(actorUserId, transaction);
      const claim = await LoyaltyClaimModel.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!claim) throw HttpError.notFound();
      if (claim.status !== 'submitted') throw HttpError.conflict('This claim has already been reviewed.');
      if (data.decision === 'rejected') {
        await claim.update(
          { status: 'rejected', reviewReason, reviewedByUserId: actorUserId, reviewedAt: new Date() },
          { transaction },
        );
        return;
      }
      const policy = await this.policies.approved('loyalty', transaction);
      const recognizedVnd = amount(data.recognizedVnd),
        verifiedReference = reference(data.verifiedReference);
      if (data.transactionVerified !== true)
        throw HttpError.badRequest('Verify the original economic transaction, not only the uploaded photograph.');
      // The same real-world invoice cannot be awarded through two owners, recrops or concurrent reviews.
      await DatabaseProvider.getInstance().query('SELECT pg_advisory_xact_lock(836205)', { transaction });
      if (/^(ORDER|BUYBACK|PAWN|MARKETPLACE):/.test(verifiedReference))
        throw HttpError.conflict('Recorded platform transactions must use their original workflow.');
      if (await LoyaltyClaimModel.findOne({ where: { verifiedReference }, transaction }))
        throw HttpError.conflict('This verified transaction already earned points.');
      await this.member(claim.userId, transaction);
      const points = pointsForNetMerchandise(recognizedVnd);
      await LoyaltyLedgerModel.create(
        {
          userId: claim.userId,
          actorUserId,
          sourceReference: `historical:${verifiedReference}`,
          kind: 'historical',
          balanceDelta: points,
          lifetimeDelta: points,
          usedDelta: 0,
          policyVersion: policy.version,
          reason: reviewReason,
          details: { claimId: id, recognizedVnd, verifiedReference },
        },
        { transaction },
      );
      await claim.update(
        {
          status: 'approved',
          recognizedVnd,
          verifiedReference,
          reviewReason,
          reviewedByUserId: actorUserId,
          reviewedAt: new Date(),
        },
        { transaction },
      );
    });
    return this.claimDetail(id, actorUserId, true);
  }

  async confirmRefund(
    orderId: number,
    actorUserId: number,
    data: Record<string, unknown>,
    outerTransaction?: Transaction,
  ) {
    const externalReference = reference(data.externalReference),
      merchandiseVnd = amount(data.merchandiseVnd, false),
      shippingVnd = amount(data.shippingVnd ?? 0, false),
      taxVnd = amount(data.taxVnd ?? 0, false),
      payoutReason = reason(data.reason);
    if (data.moneyVerified !== true || merchandiseVnd + shippingVnd + taxVnd < 1)
      throw HttpError.badRequest('Confirm a positive refund actually paid to the customer.');
    const record = async (transaction: Transaction) => {
      await this.admin(actorUserId, transaction);
      // Serialize the payout identity across orders before taking an order lock.
      await MoneyReferenceService.lock(externalReference, 'order_refund', transaction);
      await DatabaseProvider.getInstance().query('SELECT pg_advisory_xact_lock(836206, hashtext(:reference))', {
        transaction,
        replacements: { reference: externalReference },
      });
      const order = await OrderModel.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!order) throw HttpError.notFound();
      const existing = await OrderRefundModel.findOne({ where: { externalReference }, transaction });
      if (existing) {
        if (
          existing.orderId !== orderId ||
          existing.merchandiseVnd !== merchandiseVnd ||
          existing.shippingVnd !== shippingVnd ||
          existing.taxVnd !== taxVnd
        )
          throw HttpError.conflict('This payout reference was used for another refund.');
        return existing;
      }
      if (order.paymentStatus !== 'PAID' || order.status !== 'DELIVERED')
        throw HttpError.conflict(
          'Uncollected orders cannot have a sales refund. Reconcile reservation funds through their own ledger.',
        );
      const refunds = await OrderRefundModel.findAll({ where: { orderId }, transaction });
      if (
        merchandiseVnd + refunds.reduce((sum, row) => sum + row.merchandiseVnd, 0) > order.subtotal - order.discount ||
        shippingVnd + refunds.reduce((sum, row) => sum + row.shippingVnd, 0) > order.shippingFee ||
        taxVnd + refunds.reduce((sum, row) => sum + row.taxVnd, 0) > order.tax
      )
        throw HttpError.badRequest('The cumulative refund exceeds the amount collected for that component.');
      const refund = await OrderRefundModel.create(
        { orderId, actorUserId, externalReference, merchandiseVnd, shippingVnd, taxVnd, reason: payoutReason },
        { transaction },
      );
      if (await LoyaltyLedgerModel.findOne({ where: { sourceReference: `order:${orderId}` }, transaction }))
        await this.reconcileOrder(order, actorUserId, transaction);
      return refund;
    };
    return outerTransaction ? record(outerTransaction) : DatabaseProvider.getInstance().transaction(record);
  }

  async createGift(actorUserId: number, data: Record<string, unknown>) {
    const productId = amount(data.productId),
      pointsCost = amount(data.pointsCost),
      titleEn = reason(data.titleEn),
      titleVi = reason(data.titleVi);
    return DatabaseProvider.getInstance().transaction(async (transaction) => {
      await this.admin(actorUserId, transaction);
      const policy = await this.policies.approved('loyalty', transaction);
      const product = await ProductModel.findByPk(productId, { transaction });
      if (!product || !isSellable(product)) throw HttpError.notFound('Choose an actual sellable gift SKU.');
      return LoyaltyGiftModel.create(
        {
          productId,
          pointsCost,
          titleEn,
          titleVi,
          isActive: true,
          createdByUserId: actorUserId,
          policyVersion: policy.version,
        },
        { transaction },
      );
    });
  }
  async adjust(actorUserId: number, data: Record<string, unknown>) {
    const userId = amount(data.userId),
      sourceReference = `adjustment:${reference(data.requestKey)}`,
      adjustmentReason = reason(data.reason);
    const delta = data.pointsDelta;
    if (typeof delta !== 'number' || !Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > 2147483647)
      throw HttpError.badRequest('Enter a nonzero signed points adjustment.');
    return DatabaseProvider.getInstance().transaction(async (transaction) => {
      await this.admin(actorUserId, transaction);
      const policy = await this.policies.approved('loyalty', transaction);
      await this.member(userId, transaction);
      const existing = await LoyaltyLedgerModel.findOne({ where: { sourceReference }, transaction });
      if (existing) {
        if (existing.userId !== userId || existing.balanceDelta !== delta)
          throw HttpError.conflict('The adjustment reference was already used.');
        return existing;
      }
      return LoyaltyLedgerModel.create(
        {
          userId,
          actorUserId,
          sourceReference,
          kind: 'adjust',
          balanceDelta: delta,
          lifetimeDelta: 0,
          usedDelta: 0,
          policyVersion: policy.version,
          reason: adjustmentReason,
          details: {},
        },
        { transaction },
      );
    });
  }
  async requestGift(id: number, userId: number, data: Record<string, unknown>) {
    const shipping = validateShipping((data.shipping as Record<string, unknown>) || {});
    return DatabaseProvider.getInstance().transaction(async (transaction) => {
      const gift = await LoyaltyRedemptionModel.findOne({
        where: { id, userId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!gift?.giftProductId) throw HttpError.notFound();
      if (gift.status === 'fulfilled') throw HttpError.conflict('This gift has already been handed over.');
      return gift.update({ shipping, status: 'requested' }, { transaction });
    });
  }
  async fulfillGift(id: number, actorUserId: number, data: Record<string, unknown>) {
    const fulfillmentReference = reason(data.fulfillmentReference);
    if (data.handoverVerified !== true)
      throw HttpError.badRequest('Confirm the gift was actually handed over or dispatched.');
    return DatabaseProvider.getInstance().transaction(async (transaction) => {
      await this.admin(actorUserId, transaction);
      const gift = await LoyaltyRedemptionModel.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!gift?.giftProductId) throw HttpError.notFound();
      if (gift.status === 'fulfilled') {
        if (gift.fulfillmentReference !== fulfillmentReference)
          throw HttpError.conflict('The gift was fulfilled with another reference.');
        return gift;
      }
      if (gift.status !== 'requested' || !gift.shipping)
        throw HttpError.conflict('The customer must supply gift delivery details first.');
      const product = await ProductModel.findByPk(gift.giftProductId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!product) throw HttpError.notFound('The reserved gift SKU is missing.');
      await product.update({ sold: product.sold + 1 }, { transaction });
      return gift.update(
        { status: 'fulfilled', fulfillmentReference, fulfilledByUserId: actorUserId, fulfilledAt: new Date() },
        { transaction },
      );
    });
  }
  async queues(actorUserId: number) {
    await DatabaseProvider.getInstance().transaction((transaction) => this.admin(actorUserId, transaction));
    return {
      claims: await LoyaltyClaimModel.findAll({ where: { status: 'submitted' }, order: [['id', 'ASC']] }),
      gifts: await LoyaltyRedemptionModel.findAll({
        where: { giftProductId: { [Op.ne]: null }, status: { [Op.ne]: 'fulfilled' } },
        order: [['id', 'ASC']],
      }),
    };
  }
}
