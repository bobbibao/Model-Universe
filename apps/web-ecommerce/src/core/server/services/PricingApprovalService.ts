import { Op, Transaction } from 'sequelize';
import DatabaseProvider from '../database/Database.Provider';
import ProductModel from '../database/client/models/Product.Model';
import ProductCostProfileModel, {
  profileUnitCostVnd,
  type PricingRecordStatus,
} from '../database/client/models/ProductCostProfile.Model';
import ProductPriceApprovalModel from '../database/client/models/ProductPriceApproval.Model';
import PromotionAuditModel from '../database/client/models/PromotionAudit.Model';
import UserModel from '../database/internal/models/User.Model';
import HttpError from '../../../shared/server/utils/HttpError';
import type { VoucherPolicy } from '../../../shared/voucher-stack';
import CommercePolicyService from './CommercePolicyService';

// The price and cost data the v6.2 profit guard reads (docs/business/pricing-voucher-specification.md, decision V3).
// R: the published product price, unless an approved price record exists and differs from it; under the policy
// `pricingApproval: 'required'` only a price that matches an approved record counts. C: the approved cost profile
// (with the latest receipt price when that is higher than its buy-in) or, without one, the receipt price
// `importPrice`. A price or cost the guard cannot trust blocks every code (MISSING_DATA).
export interface EffectivePricing {
  costVnd: number;
  priceApproved: boolean;
}

export type PricingRecordKind = 'price' | 'cost';

const COST_FIELDS = [
  'buyInVnd',
  'repairVnd',
  'packagingVnd',
  'handlingVnd',
  'shippingSubsidyVnd',
  'fixedFeeVnd',
  'expectedReturnVnd',
] as const;

const wholeVnd = (value: unknown, label: string, min = 0) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > 2_000_000_000)
    throw HttpError.badRequest(`${label} must be a whole VND amount of at least ${min}.`);
  return value;
};
const text = (value: unknown, label: string, max = 1000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw HttpError.badRequest(`${label} is required (at most ${max} characters).`);
  return value.trim();
};

export default class PricingApprovalService {
  private policies = new CommercePolicyService();

  // Everything the guard needs for these products: the approved voucher policy (and its version, for the order
  // snapshot) and their effective price and cost.
  async context(products: Iterable<Pick<ProductModel, 'id' | 'price' | 'importPrice' | 'partnerId'>>, transaction?: Transaction) {
    const { policy, version } = await this.policies.voucherPolicy(transaction);
    return { policy, policyVersion: version, pricing: await this.effective([...products], policy, transaction) };
  }

  // Approved records of these products, for the guard.
  async effective(
    products: readonly Pick<ProductModel, 'id' | 'price' | 'importPrice' | 'partnerId'>[],
    policy: Pick<VoucherPolicy, 'pricingApproval'>,
    transaction?: Transaction,
  ): Promise<Map<number, EffectivePricing>> {
    const ids = [...new Set(products.filter((product) => !product.partnerId).map((product) => product.id))];
    const where = { productId: { [Op.in]: ids }, status: 'APPROVED' };
    const [costs, prices] = ids.length
      ? await Promise.all([
          ProductCostProfileModel.findAll({ where, transaction }),
          ProductPriceApprovalModel.findAll({ where, transaction }),
        ])
      : [[], []];
    const costOf = new Map(costs.map((row) => [row.productId, row]));
    const priceOf = new Map(prices.map((row) => [row.productId, row]));
    return new Map(
      products.map((product) => {
        const profile = costOf.get(product.id),
          approved = priceOf.get(product.id);
        const receipt = product.importPrice ?? 0;
        return [
          product.id,
          {
            costVnd: profile ? profileUnitCostVnd(profile, receipt) : receipt,
            priceApproved: product.partnerId
              ? true
              : approved
                ? approved.listPriceVnd === product.price
                : policy.pricingApproval === 'recorded',
          },
        ];
      }),
    );
  }

  // The unit cost C of these products (the approved cost profile, else the receipt price), for the direct-sale floor.
  async unitCosts(
    products: readonly Pick<ProductModel, 'id' | 'price' | 'importPrice' | 'partnerId'>[],
    transaction?: Transaction,
  ) {
    const effective = await this.effective(products, { pricingApproval: 'recorded' }, transaction);
    return new Map([...effective].map(([id, value]) => [id, value.costVnd]));
  }

  // Products with their approved and proposed records, newest first, for the admin page.
  async list(query: { q?: unknown; limit?: unknown } = {}) {
    const q = typeof query.q === 'string' ? query.q.trim() : '';
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const products = await ProductModel.findAll({
      where: {
        partnerId: null,
        isArchived: false,
        ...(q ? { [Op.or]: [{ name: { [Op.iLike]: `%${q}%` } }, { sku: { [Op.iLike]: `%${q}%` } }] } : {}),
      },
      attributes: ['id', 'sku', 'name', 'price', 'importPrice', 'pricingReferenceMemberVnd'],
      order: [['id', 'ASC']],
      limit,
    });
    const ids = products.map((product) => product.id);
    const [costs, prices] = await Promise.all([
      ProductCostProfileModel.findAll({ where: { productId: { [Op.in]: ids } }, order: [['version', 'DESC']] }),
      ProductPriceApprovalModel.findAll({ where: { productId: { [Op.in]: ids } }, order: [['version', 'DESC']] }),
    ]);
    const effective = await this.effective(products, { pricingApproval: 'recorded' });
    return products.map((product) => {
      const priceRecords = prices.filter((row) => row.productId === product.id);
      const approvedPrice = priceRecords.find((row) => row.status === 'APPROVED') ?? null;
      return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        priceVnd: product.price,
        receiptCostVnd: product.importPrice,
        referenceMemberVnd: product.pricingReferenceMemberVnd,
        unitCostVnd: effective.get(product.id)!.costVnd,
        // The product's current price differs from its approved R: codes are blocked until it is approved again.
        priceMismatch: !!approvedPrice && approvedPrice.listPriceVnd !== product.price,
        prices: priceRecords.slice(0, 5),
        costs: costs.filter((row) => row.productId === product.id).slice(0, 5),
      };
    });
  }

  private async admin(userId: number, transaction: Transaction) {
    const user = await UserModel.findByPk(userId, { transaction });
    if (!user?.isActive || user.role !== 'ADMIN') throw HttpError.forbidden();
  }

  private async product(productId: unknown, transaction: Transaction) {
    const product = await ProductModel.findByPk(Number(productId) || 0, { transaction, lock: transaction.LOCK.UPDATE });
    if (!product) throw HttpError.notFound('Product not found.');
    if (product.partnerId) throw HttpError.conflict('Partner goods are priced through their seller listing.');
    return product;
  }

  private nextVersion(model: typeof ProductCostProfileModel | typeof ProductPriceApprovalModel, productId: number, transaction: Transaction) {
    return (model as typeof ProductCostProfileModel)
      .max('version', { where: { productId }, transaction })
      .then((max) => (Number(max) || 0) + 1);
  }

  // A DRAFT list price R: the product's current price, with the proof that it is really published.
  async proposePrice(actorUserId: number, data: Record<string, unknown>) {
    const proof = text(data.proof, 'Proof of the published price'),
      reason = text(data.reason, 'A reason');
    return DatabaseProvider.getInstance().transaction(async (transaction) => {
      await this.admin(actorUserId, transaction);
      const product = await this.product(data.productId, transaction);
      const listPriceVnd = wholeVnd(data.listPriceVnd, 'The list price', 1);
      // R is the price the shop really publishes, never one derived in this form.
      if (listPriceVnd !== product.price)
        throw HttpError.conflict('Propose the price the product is published at; change the product price first.', 'PRICE_CHANGED');
      const row = await ProductPriceApprovalModel.create(
        {
          productId: product.id,
          version: await this.nextVersion(ProductPriceApprovalModel, product.id, transaction),
          listPriceVnd,
          referenceMemberVnd: product.pricingReferenceMemberVnd ?? null,
          proof,
          reason,
          proposedByUserId: actorUserId,
        },
        { transaction },
      );
      await this.audit('price_approval', row.id, 'propose', actorUserId, null, row.get({ plain: true }), transaction);
      return row;
    });
  }

  // A DRAFT cost profile.
  async proposeCost(actorUserId: number, data: Record<string, unknown>) {
    const reason = text(data.reason, 'A reason');
    const values = Object.fromEntries(
      COST_FIELDS.map((field) => [field, wholeVnd(data[field] ?? 0, field, field === 'buyInVnd' ? 1 : 0)]),
    ) as Record<(typeof COST_FIELDS)[number], number>;
    return DatabaseProvider.getInstance().transaction(async (transaction) => {
      await this.admin(actorUserId, transaction);
      const product = await this.product(data.productId, transaction);
      const row = await ProductCostProfileModel.create(
        {
          productId: product.id,
          version: await this.nextVersion(ProductCostProfileModel, product.id, transaction),
          ...values,
          reason,
          proposedByUserId: actorUserId,
        },
        { transaction },
      );
      await this.audit('cost_profile', row.id, 'propose', actorUserId, null, row.get({ plain: true }), transaction);
      return row;
    });
  }

  private model(kind: PricingRecordKind) {
    if (kind === 'price') return ProductPriceApprovalModel as unknown as typeof ProductCostProfileModel;
    if (kind === 'cost') return ProductCostProfileModel;
    throw HttpError.badRequest('Unknown pricing record.');
  }

  // Approve a DRAFT: a second admin, never the proposer (v6.2 SRS: separate approver). The product's earlier approved
  // record is retired in the same transaction, so at most one is approved.
  async approve(kind: PricingRecordKind, id: number, actorUserId: number) {
    const model = this.model(kind);
    return DatabaseProvider.getInstance().transaction(async (transaction) => {
      await this.admin(actorUserId, transaction);
      const row = await model.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!row) throw HttpError.notFound('Pricing record not found.');
      if (row.status !== 'DRAFT') throw HttpError.conflict('Only a draft can be approved.');
      if (row.proposedByUserId === actorUserId)
        throw HttpError.conflict('A second admin must approve what you proposed.', 'SEPARATE_APPROVER');
      const product = await this.product(row.productId, transaction);
      if (kind === 'price' && (row as unknown as ProductPriceApprovalModel).listPriceVnd !== product.price)
        throw HttpError.conflict('The product price changed since this was proposed. Propose the current price.', 'PRICE_CHANGED');
      const now = new Date();
      await model.update(
        { status: 'RETIRED' as PricingRecordStatus, retiredByUserId: actorUserId, retiredAt: now },
        { where: { productId: row.productId, status: 'APPROVED' }, transaction },
      );
      const before = row.get({ plain: true });
      await row.update({ status: 'APPROVED', approvedByUserId: actorUserId, approvedAt: now }, { transaction });
      await this.audit(kind === 'price' ? 'price_approval' : 'cost_profile', row.id, 'approve', actorUserId, before, row.get({ plain: true }), transaction);
      return row;
    });
  }

  // Withdraw a draft. An approved record is only ever replaced by approving a newer draft (a second admin): retiring it
  // directly could fall back to a lower cost or unblock a changed price without that second look.
  async retire(kind: PricingRecordKind, id: number, actorUserId: number) {
    const model = this.model(kind);
    return DatabaseProvider.getInstance().transaction(async (transaction) => {
      await this.admin(actorUserId, transaction);
      const row = await model.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!row) throw HttpError.notFound('Pricing record not found.');
      if (row.status === 'RETIRED') return row;
      if (row.status !== 'DRAFT')
        throw HttpError.conflict('An approved record is replaced by approving a newer draft.', 'APPROVED_RECORD');
      const before = row.get({ plain: true });
      await row.update({ status: 'RETIRED', retiredByUserId: actorUserId, retiredAt: new Date() }, { transaction });
      await this.audit(kind === 'price' ? 'price_approval' : 'cost_profile', row.id, 'retire', actorUserId, before, row.get({ plain: true }), transaction);
      return row;
    });
  }

  private audit(
    entityType: string,
    entityId: number,
    action: string,
    actorUserId: number,
    oldValue: Record<string, unknown> | null,
    newValue: Record<string, unknown>,
    transaction: Transaction,
  ) {
    return PromotionAuditModel.create({ actorUserId, entityType, entityId, action, oldValue, newValue }, { transaction });
  }
}
