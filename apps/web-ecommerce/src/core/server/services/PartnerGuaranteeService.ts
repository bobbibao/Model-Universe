import type { Transaction } from 'sequelize';
import DatabaseProvider from '../database/Database.Provider';
import UserModel from '../database/internal/models/User.Model';
import PartnerProfileModel from '../database/client/models/PartnerProfile.Model';
import PartnerGuaranteeModel from '../database/client/models/PartnerGuarantee.Model';
import PartnerGuaranteePaymentModel from '../database/client/models/PartnerGuaranteePayment.Model';
import ProductModel from '../database/client/models/Product.Model';
import OrderItemModel from '../database/client/models/OrderItem.Model';
import PartnerListingEventModel from '../database/client/models/PartnerListingEvent.Model';
import CommercePolicyService from './CommercePolicyService';
import MoneyReferenceService from './MoneyReferenceService';
import HttpError from '../../../shared/server/utils/HttpError';

export default class PartnerGuaranteeService {
  private async listing(productId: number, userId: number, admin: boolean, transaction: Transaction) {
    const user = await UserModel.findByPk(userId, { transaction });
    if (!user?.isActive || (admin && user.role !== 'ADMIN')) throw HttpError.forbidden();
    const original = await ProductModel.findByPk(productId, { transaction });
    if (!original?.partnerId) throw HttpError.notFound();
    const partner = await PartnerProfileModel.findByPk(original.partnerId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!partner || (!admin && partner.userId !== userId)) throw HttpError.notFound();
    const product = (await ProductModel.findByPk(productId, { transaction, lock: transaction.LOCK.UPDATE }))!;
    return { product, partner };
  }
  private bank(partner: PartnerProfileModel) {
    const { bankName, bankAccount, accountHolder } = partner.application;
    return { bankName, bankAccount, accountHolder };
  }
  private async quote(product: ProductModel, transaction: Transaction) {
    const policy = await new CommercePolicyService().approved('marketplace', transaction);
    const rounding = policy.settings.guaranteeRounding;
    if (policy.settings.guaranteeBasisPoints !== 1000 || !['ceil', 'floor', 'nearest'].includes(String(rounding)))
      throw HttpError.policyApprovalRequired('marketplace');
    const value = product.price * product.stock;
    if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647)
      throw HttpError.conflict('Review the current listing value.', 'PARTNER_STATE_CHANGED');
    const raw = value / 10;
    const requiredVnd = rounding === 'ceil' ? Math.ceil(raw) : rounding === 'floor' ? Math.floor(raw) : Math.round(raw);
    if (requiredVnd < 1)
      throw HttpError.badRequest(
        'The listing value cannot produce a positive guarantee.',
        undefined,
        'PARTNER_LISTING_INVALID',
      );
    return {
      productValueVnd: value,
      requiredVnd,
      policyId: policy.id,
      policyVersion: policy.version,
      settings: policy.settings,
    };
  }
  async detail(productId: number, userId: number, admin = false) {
    return DatabaseProvider.getInstance().transaction(async (transaction) => {
      const { product } = await this.listing(productId, userId, admin, transaction);
      const rows = await PartnerGuaranteeModel.findAll({ where: { productId }, order: [['id', 'DESC']], transaction });
      const guarantees = [];
      for (const row of rows) {
        const payments = await PartnerGuaranteePaymentModel.findAll({
          where: { guaranteeId: row.id },
          order: [['id', 'ASC']],
          transaction,
        });
        const cancelled = !!(await PartnerListingEventModel.findOne({
          where: { productId, action: 'guarantee_cancelled', details: { guaranteeId: row.id } },
          transaction,
        }));
        guarantees.push({
          ...row.toJSON(),
          cancelled,
          payments,
          heldVnd: payments.reduce(
            (sum, payment) => sum + (payment.kind === 'receipt' ? payment.amountVnd : -payment.amountVnd),
            0,
          ),
        });
      }
      let quote = null,
        policyRequired = false;
      try {
        if (product.listingStatus === 'approved' && product.stock > 0) quote = await this.quote(product, transaction);
      } catch (error) {
        if ((error as { code?: string }).code === 'POLICY_APPROVAL_REQUIRED') policyRequired = true;
        else throw error;
      }
      return { productId, listingVersion: product.listingVersion, quote, policyRequired, guarantees };
    });
  }
  async accept(productId: number, userId: number, body: Record<string, unknown>) {
    if (
      !Number.isSafeInteger(body.expectedVersion) ||
      Number(body.expectedVersion) < 1 ||
      !Number.isSafeInteger(body.policyVersion) ||
      Number(body.policyVersion) < 1 ||
      !Number.isSafeInteger(body.requiredVnd) ||
      Number(body.requiredVnd) < 1
    )
      throw HttpError.badRequest('Review the exact current guarantee quote.', undefined, 'PARTNER_GUARANTEE_CONSENT');
    if (body.termsAccepted !== true)
      throw HttpError.badRequest('Accept the exact guarantee terms.', undefined, 'PARTNER_GUARANTEE_CONSENT');
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      const { product, partner } = await this.listing(productId, userId, false, transaction);
      const replay = await PartnerGuaranteeModel.findOne({
        where: { productId, listingVersion: body.expectedVersion },
        transaction,
      });
      if (replay) {
        if (replay.terms.policyVersion !== body.policyVersion || replay.requiredVnd !== body.requiredVnd)
          throw HttpError.conflict('The accepted terms differ.', 'PARTNER_STATE_CHANGED');
        return;
      }
      if (
        !['verified', 'restricted'].includes(partner.status) ||
        !partner.bankVerifiedAt ||
        !partner.identityVerifiedAt ||
        product.listingStatus !== 'approved' ||
        product.listingVersion !== body.expectedVersion
      )
        throw HttpError.conflict('Review the current approved listing and verified account.', 'PARTNER_STATE_CHANGED');
      if (await this.outstanding(productId, transaction))
        throw HttpError.conflict(
          'Resolve the previous guarantee before accepting revised terms.',
          'PARTNER_GUARANTEE_HELD',
        );
      const quote = await this.quote(product, transaction);
      if (quote.policyVersion !== body.policyVersion || quote.requiredVnd !== body.requiredVnd)
        throw HttpError.conflict('The guarantee quote changed.', 'PARTNER_STATE_CHANGED');
      await PartnerGuaranteeModel.create(
        {
          productId,
          partnerId: partner.id,
          actorUserId: userId,
          listingVersion: product.listingVersion,
          productValueVnd: quote.productValueVnd,
          requiredVnd: quote.requiredVnd,
          terms: {
            ...quote,
            bank: this.bank(partner),
            priceVnd: product.price,
            quantity: product.stock,
            sku: product.sku,
            acceptedAt: new Date().toISOString(),
          },
        },
        { transaction },
      );
    });
    return this.detail(productId, userId);
  }
  // Unpaid accepted terms also need closing before merchandise is revised.
  static async locked(productId: number, transaction: Transaction) {
    const rows = await PartnerGuaranteeModel.findAll({ where: { productId }, transaction });
    for (const row of rows) {
      const refunded = await PartnerGuaranteePaymentModel.findOne({
        where: { guaranteeId: row.id, kind: 'refund' },
        transaction,
      });
      const cancelled = await PartnerListingEventModel.findOne({
        where: { productId, action: 'guarantee_cancelled', details: { guaranteeId: row.id } },
        transaction,
      });
      if (!refunded && !cancelled) return true;
    }
    return false;
  }
  private async outstanding(productId: number, transaction: Transaction) {
    return PartnerGuaranteeService.locked(productId, transaction);
  }
  async cancel(productId: number, userId: number, body: Record<string, unknown>) {
    if (!Number.isSafeInteger(body.guaranteeId) || Number(body.guaranteeId) < 1) throw HttpError.notFound();
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      const { product, partner } = await this.listing(productId, userId, false, transaction);
      const guarantee = await PartnerGuaranteeModel.findOne({
        where: { id: body.guaranteeId, productId, partnerId: partner.id },
        transaction,
      });
      if (!guarantee) throw HttpError.notFound();
      if (await PartnerGuaranteePaymentModel.count({ where: { guaranteeId: guarantee.id }, transaction }))
        throw HttpError.conflict('Received guarantees require a verified bank refund.', 'PARTNER_GUARANTEE_HELD');
      if (
        !(await PartnerListingEventModel.findOne({
          where: { productId, action: 'guarantee_cancelled', details: { guaranteeId: guarantee.id } },
          transaction,
        }))
      ) {
        await PartnerListingEventModel.create(
          {
            productId,
            partnerId: partner.id,
            actorUserId: userId,
            version: product.listingVersion,
            action: 'guarantee_cancelled',
            details: { guaranteeId: guarantee.id },
          },
          { transaction },
        );
      }
    });
    return this.detail(productId, userId);
  }
  async confirm(productId: number, userId: number, body: Record<string, unknown>) {
    const kind = body.kind;
    const externalReference =
      typeof body.externalReference === 'string' ? body.externalReference.trim().toUpperCase() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (
      !['receipt', 'refund'].includes(String(kind)) ||
      !/^[A-Z0-9][A-Z0-9:/._-]{7,127}$/.test(externalReference) ||
      !reason ||
      reason.length > 1000 ||
      body.moneyVerified !== true ||
      !Number.isSafeInteger(body.amountVnd) ||
      Number(body.amountVnd) < 1 ||
      !Number.isSafeInteger(body.guaranteeId)
    )
      throw HttpError.badRequest(
        'Verify the actual transfer, whole VND amount and reference.',
        undefined,
        'PARTNER_GUARANTEE_TRANSFER',
      );
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      await MoneyReferenceService.lock(externalReference, 'partner_guarantee_payment', transaction);
      const { product, partner } = await this.listing(productId, userId, true, transaction);
      const guarantee = await PartnerGuaranteeModel.findOne({
        where: { id: body.guaranteeId, productId, partnerId: partner.id },
        transaction,
      });
      if (!guarantee) throw HttpError.notFound();
      const replay = await PartnerGuaranteePaymentModel.findOne({ where: { externalReference }, transaction });
      if (replay) {
        if (replay.guaranteeId !== guarantee.id || replay.kind !== kind || replay.amountVnd !== body.amountVnd)
          throw HttpError.conflict('This bank reference belongs to another transfer.', 'PAYMENT_REFERENCE_REUSED');
        return;
      }
      if (
        body.amountVnd !== guarantee.requiredVnd ||
        (await PartnerGuaranteePaymentModel.findOne({ where: { guaranteeId: guarantee.id, kind }, transaction }))
      )
        throw HttpError.conflict('Confirm the exact guarantee amount once.', 'PARTNER_GUARANTEE_TRANSFER');
      if (kind === 'receipt') {
        if (
          await PartnerListingEventModel.findOne({
            where: { productId, action: 'guarantee_cancelled', details: { guaranteeId: guarantee.id } },
            transaction,
          })
        )
          throw HttpError.conflict('The unpaid guarantee terms were withdrawn.', 'PARTNER_STATE_CHANGED');
      } else {
        if (
          product.listingStatus !== 'hidden' ||
          !(await PartnerGuaranteePaymentModel.findOne({
            where: { guaranteeId: guarantee.id, kind: 'receipt' },
            transaction,
          }))
        )
          throw HttpError.conflict(
            'Hide the listing and verify its received guarantee before returning it.',
            'PARTNER_GUARANTEE_TRANSFER',
          );
        // Published or purchased items need their settlement/dispute reconciliation, not this unused-listing refund.
        if (
          (await OrderItemModel.count({ where: { productId }, transaction })) ||
          (await PartnerListingEventModel.count({ where: { productId, action: 'published' }, transaction }))
        )
          throw HttpError.conflict(
            'Resolve sale and dispute obligations before returning this guarantee.',
            'PARTNER_GUARANTEE_OBLIGATIONS',
          );
        const bank = guarantee.terms.bank as Record<string, unknown>;
        if (
          body.bankVerified !== true ||
          Object.entries(this.bank(partner)).some(([key, value]) => bank[key] !== value)
        )
          throw HttpError.conflict(
            'Verify the unchanged payout account accepted in these terms.',
            'PARTNER_GUARANTEE_BANK',
          );
      }
      await PartnerGuaranteePaymentModel.create(
        {
          guaranteeId: guarantee.id,
          actorUserId: userId,
          kind,
          amountVnd: body.amountVnd,
          externalReference,
          reason,
          bankSnapshot: this.bank(partner),
        },
        { transaction },
      );
    });
    return this.detail(productId, userId, true);
  }
}
