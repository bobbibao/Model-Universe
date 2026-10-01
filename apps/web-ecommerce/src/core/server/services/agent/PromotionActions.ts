import { Op } from 'sequelize';
import AgentActionModel from '../../database/client/models/AgentAction.Model';
import CategoryModel from '../../database/client/models/Category.Model';
import CouponModel from '../../database/client/models/Coupon.Model';
import MarketingCampaignModel from '../../database/client/models/MarketingCampaign.Model';
import ProductDiscountModel from '../../database/client/models/ProductDiscount.Model';
import ProductModel from '../../database/client/models/Product.Model';
import { AgentApiError } from '../../../../shared/server/utils/AgentApiUtils';
import { campaignKind, startOf, type CampaignBody, type CouponBody, type DiscountBody } from './AgentLimits';
import { DAY_MS, lockProductsBySku, type Applied, type WriteContext } from './AgentWrites';

// Promotions and campaigns (docs/GROWTH_AGENT.md section 4). The rules ran before (AgentPolicyService); these apply.

const window = (startsAt: Date | null | undefined, days: number, now: Date) => {
  const start = startOf(startsAt, now);
  return { start, end: new Date(start.getTime() + days * DAY_MS) };
};

// A discount on SKUs or a whole category; with `replace_existing`, the agent's overlapping discounts end first (the
// verdict names their actions) and run again if this one is reverted.
export const applyDiscount = async ({ body, transaction, actionId, now, decision }: WriteContext<DiscountBody>) => {
  let products: ProductModel[];
  if (body.category !== undefined) {
    const category = await CategoryModel.findOne({ where: { slug: body.category }, transaction });
    if (!category) throw new AgentApiError('not_found', `no category ${body.category}`);
    products = await ProductModel.findAll({
      where: { categoryId: category.id, isArchived: false },
      order: [['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  } else {
    products = await lockProductsBySku(body.skus ?? [], transaction);
  }
  const { start, end } = window(body.starts_at, body.duration_days, now);

  let replacedIds: number[] = [];
  const replaces = decision?.verdict.replaces ?? [];
  if (replaces.length > 0) {
    const actions = await AgentActionModel.findAll({ where: { idempotencyKey: { [Op.in]: replaces } }, transaction });
    const replaced = await ProductDiscountModel.findAll({
      where: { agentActionId: { [Op.in]: actions.map((a) => a.id) }, revokedAt: null },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    replacedIds = replaced.map((d) => d.id);
    await ProductDiscountModel.update({ revokedAt: now }, { where: { id: { [Op.in]: replacedIds } }, transaction });
  }
  const discounts = await ProductDiscountModel.bulkCreate(
    products.map((product) => ({
      productId: product.id,
      percent: body.percent,
      startsAt: start,
      endsAt: end,
      agentActionId: actionId,
      campaignRef: body.campaign_ref ?? null,
    })),
    { transaction, returning: true },
  );
  return {
    detail:
      `${body.percent}% off ${products.length} SKU(s) from ${start.toISOString()} until ${end.toISOString()}` +
      (replacedIds.length ? `; ended ${replacedIds.length} earlier agent discount(s)` : ''),
    undo: { kind: 'discount', discountIds: discounts.map((d) => d.id), replacedIds },
  } satisfies Applied;
};

export const createCoupon = async ({ body, transaction, actionId, now }: WriteContext<CouponBody>) => {
  const { start, end } = window(body.starts_at, body.duration_days, now);
  const coupon = await CouponModel.create(
    {
      code: body.code,
      title: body.title,
      discountPercent: body.percent,
      usageLimit: body.usage_limit ?? null,
      usageCount: 0,
      startDate: start,
      expirationDate: end,
      isActive: true,
      minOrderVnd: body.min_order_vnd ?? 0,
      source: 'agent',
      agentActionId: actionId,
      campaignRef: body.campaign_ref ?? null,
    },
    { transaction },
  );
  return {
    detail: `coupon ${coupon.code}: ${body.percent}% from ${start.toISOString()} until ${end.toISOString()}`,
    undo: { kind: 'coupon', couponId: coupon.id },
  } satisfies Applied;
};

// Protective: the agent's coupon `ref`, or every agent discount and coupon of campaign `ref`. Admin promotions are
// never touched; ending twice is harmless.
export const endPromotions = async ({ path, transaction, now }: WriteContext<unknown>): Promise<Applied> => {
  const ref = path.ref;
  const [coupons] = await CouponModel.update(
    { isActive: false },
    {
      where: { source: 'agent', isActive: true, [Op.or]: [{ code: ref }, { campaignRef: ref }] },
      transaction,
    },
  );
  const [discounts] = await ProductDiscountModel.update(
    { revokedAt: now },
    {
      where: {
        campaignRef: ref,
        agentActionId: { [Op.ne]: null },
        revokedAt: null,
        endsAt: { [Op.gt]: now },
      },
      transaction,
    },
  );
  return { detail: `ended ${coupons} coupon(s) and ${discounts} discount(s) of ${ref}`, undo: null };
};

export const createCampaign = async ({ body, transaction, actionId, now }: WriteContext<CampaignBody>) => {
  const { start, end } = window(body.starts_at, body.duration_days, now);
  await MarketingCampaignModel.create(
    {
      ref: body.ref,
      kind: campaignKind(body.channels),
      name: body.name,
      channels: body.channels,
      objective: body.objective,
      threadId: body.thread_id ?? null,
      status: 'active',
      startsAt: start,
      endsAt: end,
      budgetVnd: body.budget_vnd ?? 0,
      utmCampaign: body.ref,
      agentActionId: actionId,
    },
    { transaction },
  );
  return {
    detail: `campaign ${body.ref} (${body.channels.join(', ')}) until ${end.toISOString()}`,
    undo: { kind: 'campaign', ref: body.ref, previous: 'active' },
  } satisfies Applied;
};
