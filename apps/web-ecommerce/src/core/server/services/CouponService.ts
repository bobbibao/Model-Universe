import { Op, WhereOptions } from 'sequelize';
import { TIER_ORDER } from '../../../shared/promotions';
import CouponModel from '../database/client/models/Coupon.Model';
import { BaseServiceInterface } from './BaseServiceInterface';
import HttpError from '../../../shared/server/utils/HttpError';
import { asTrimmedString, toInteger } from '../../../shared/server/utils/ValidationUtils';
import { formatVND } from '../../../shared/server/utils/utils';
import PromotionAuditModel from '../database/client/models/PromotionAudit.Model';
import {
  evaluateVoucher,
  VOUCHER_MAX_PERCENT,
  VOUCHER_MIN_PERCENT,
  type PricingLine,
  type VoucherRefusal,
  type VoucherTerms,
} from '../../../shared/pricing';
import type { MainVoucher, StackLine } from '../../../shared/voucher-stack';

export interface CouponListQuery {
  q?: string;
  status?: string;
  limit: number;
  offset: number;
  sortKey?: string;
  sortDirection?: string;
}

const CODE_PATTERN = /^[A-Z0-9_-]{3,30}$/;
const SORTABLE_COLUMNS = ['id', 'code', 'discountPercent', 'usageCount', 'startDate', 'expirationDate'];

export const normalizeCouponCode = (code: unknown) => asTrimmedString(code).toUpperCase();

export const calculateDiscount = (subtotal: number, discountPercent: number) =>
  Math.round((subtotal * discountPercent) / 100);

// Agent coupons never take a line below half its list price together with the line's running discount (Decree
// 81/2018 as amended by 128/2024). The Agent API already refuses such coupons; this is the defence in depth.
export const LEGAL_MAX_COMBINED_PCT = 50;

export interface PricedLine {
  managedSale?: boolean;
  partnerId?: number | null;
  listPrice: number;
  salePrice: number;
  quantity: number;
  // Needed by vouchers with SKU lists or the profit floor (src/shared/pricing.ts).
  productId?: number;
  sku?: string;
  costVnd?: number;
  // false when the list price is not an approved R (PricingApprovalService): the guard then blocks every code.
  priceApproved?: boolean;
}

type SmartCoupon = Pick<CouponModel, 'discountPercent' | 'source'> &
  Partial<
    Pick<
      CouponModel,
      | 'fixedAmountVnd'
      | 'maxDiscountVnd'
      | 'minOrderVnd'
      | 'kind'
      | 'profitGuard'
      | 'eligibleSkus'
      | 'excludedSkus'
      | 'cartType'
    >
  >;

// Coupons governed by the voucher rules 4.0: member codes, profit-guarded vouchers, and codes with a cap, SKU lists or a
// cart type. Plain legacy and agent coupons keep their original arithmetic.
export const isSmartCoupon = (coupon: SmartCoupon) =>
  coupon.source !== 'agent' &&
  coupon.source !== 'loyalty' &&
  (coupon.kind === 'member' ||
    !!coupon.profitGuard ||
    !!coupon.eligibleSkus?.length ||
    !!coupon.excludedSkus?.length ||
    (!!coupon.cartType && coupon.cartType !== 'any') ||
    !!coupon.maxDiscountVnd);

export const voucherTerms = (coupon: SmartCoupon): VoucherTerms => ({
  discountPercent: coupon.discountPercent,
  fixedAmountVnd: coupon.fixedAmountVnd || null,
  maxDiscountVnd: coupon.maxDiscountVnd ?? null,
  minOrderVnd: coupon.minOrderVnd ?? 0,
  eligibleSkus: coupon.eligibleSkus ?? null,
  excludedSkus: coupon.excludedSkus ?? null,
  cartType: coupon.cartType ?? 'any',
  profitGuard: !!coupon.profitGuard,
});

// A shop code as a v6.2 main voucher (src/shared/voucher-stack.ts): a percentage of the eligible list price with its
// published cap, or a fixed amount.
export const couponVoucher = (
  coupon: SmartCoupon & Pick<CouponModel, 'code'> & Partial<Pick<CouponModel, 'expirationDate' | 'budgetVnd' | 'budgetUsedVnd'>>,
): MainVoucher => ({
  code: coupon.code,
  ...(coupon.fixedAmountVnd
    ? { kind: 'FIXED' as const, amountVnd: coupon.fixedAmountVnd }
    : { kind: 'PERCENT' as const, bps: Math.round(coupon.discountPercent * 100) }),
  capVnd: coupon.maxDiscountVnd ?? null,
  minimumOrderVnd: coupon.minOrderVnd ?? 0,
  cartType: coupon.cartType ?? 'any',
  eligibleSkus: coupon.eligibleSkus ?? null,
  excludedSkus: coupon.excludedSkus ?? null,
  expiresAt: coupon.expirationDate ? new Date(coupon.expirationDate).toISOString() : null,
  remainingBudgetVnd:
    coupon.budgetVnd === null || coupon.budgetVnd === undefined ? null : coupon.budgetVnd - (coupon.budgetUsedVnd ?? 0),
});

// Lines as the v6.2 rules see them: the price charged is R (the sale price during a managed sale, with the regular list
// price kept for the standard profit), and the shop's recorded cost.
export const toStackLines = (lines: PricedLine[]): StackLine[] =>
  lines
    .filter((line) => line.quantity > 0)
    .map((line, index) => ({
      sku: line.sku || `LINE-${line.productId ?? index}`,
      quantity: line.quantity,
      listPriceVnd: line.priceApproved === false ? null : line.salePrice,
      ...(line.managedSale ? { standardListPriceVnd: line.listPrice } : {}),
      unitCostVnd: line.costVnd ?? null,
      shopOwned: !line.partnerId,
    }));

export const toPricingLines = (lines: PricedLine[]): PricingLine[] =>
  lines.map((line, index) => ({
    productId: line.productId ?? -1 - index,
    sku: line.sku ?? '',
    unitPriceVnd: line.salePrice,
    ...(line.managedSale ? { referenceListPriceVnd: line.listPrice } : {}),
    quantity: line.quantity,
    unitCostVnd: line.costVnd ?? 0,
    partnerId: line.partnerId,
  }));

export const REFUSAL_MESSAGES: Record<VoucherRefusal, string> = {
  no_eligible_items: 'Mã này không áp dụng cho sản phẩm trong giỏ.',
  minimum_order: 'Giỏ hàng chưa đạt giá trị tối thiểu của mã.',
  cart_type: 'Mã này chỉ áp dụng cho loại giỏ hàng khác (một sản phẩm hoặc giỏ từ hai sản phẩm).',
  missing_cost: 'Mã này tạm chưa áp dụng được cho sản phẩm trong giỏ.',
  no_standard_profit: 'Mã này không áp dụng được cho sản phẩm trong giỏ.',
  profit_floor: 'Mã này vượt mức ưu đãi cho phép với giỏ hàng hiện tại. Hãy thử mã khác hoặc thêm sản phẩm phù hợp.',
};

// The coupon's discount on these lines (whole VND).
export const couponDiscount = (coupon: SmartCoupon, lines: PricedLine[]) => {
  // Owner-delegated marketplace rule: shop promotions affect shop-owned merchandise only.
  lines = lines.filter((line) => !line.partnerId);
  if (lines.some((line) => line.managedSale) && coupon.source !== 'loyalty') {
    const evaluation = evaluateVoucher({ ...voucherTerms(coupon), profitGuard: true }, toPricingLines(lines));
    if (!evaluation.eligible) throw HttpError.conflict(REFUSAL_MESSAGES[evaluation.refusal!], 'VOUCHER_NOT_ELIGIBLE');
    return evaluation.discountVnd;
  }
  if (isSmartCoupon(coupon as SmartCoupon)) {
    const evaluation = evaluateVoucher(voucherTerms(coupon as SmartCoupon), toPricingLines(lines));
    if (!evaluation.eligible) throw HttpError.conflict(REFUSAL_MESSAGES[evaluation.refusal!], 'VOUCHER_NOT_ELIGIBLE');
    return evaluation.discountVnd;
  }
  const subtotal = lines.reduce((sum, line) => sum + line.salePrice * line.quantity, 0);
  if (coupon.source === 'loyalty') {
    if (lines.some((line) => line.salePrice < line.listPrice))
      throw HttpError.conflict(
        'Choose either the sale price or a member reward; benefits cannot be combined.',
        'BENEFIT_CONFLICT',
      );
    const benefit = coupon.fixedAmountVnd || calculateDiscount(subtotal, coupon.discountPercent);
    return Math.max(0, Math.min(benefit, coupon.maxDiscountVnd ?? benefit, Math.floor(subtotal / 2)));
  }
  const full = calculateDiscount(subtotal, coupon.discountPercent);
  if (coupon.source !== 'agent') return full;
  const allowed = lines.reduce((sum, line) => {
    const room = Math.max(0, (line.listPrice * LEGAL_MAX_COMBINED_PCT) / 100 - (line.listPrice - line.salePrice));
    return sum + Math.min((line.salePrice * line.quantity * coupon.discountPercent) / 100, room * line.quantity);
  }, 0);
  return Math.min(full, Math.floor(allowed));
};

// Throws a user-facing error when the coupon cannot be used right now on an order of `subtotal` (whole VND).
export const assertCouponUsable = (coupon: CouponModel | null, subtotal: number, userId?: number): CouponModel => {
  const now = Date.now();
  if (!coupon) throw HttpError.badRequest('Mã giảm giá không tồn tại.');
  if (subtotal < 1)
    throw HttpError.conflict('This benefit requires eligible shop-owned merchandise.', 'BENEFIT_CONFLICT');
  if (coupon.ownerUserId && coupon.ownerUserId !== userId)
    throw HttpError.notFound('This reward belongs to another collector.');
  if (coupon.source === 'loyalty' && (coupon.reservedOrderId || coupon.usedAt))
    throw HttpError.conflict('This reward is already reserved or used.', 'REWARD_UNAVAILABLE');
  if (coupon.kind === 'member_template') throw HttpError.badRequest('Mã giảm giá không tồn tại.');
  if (!coupon.isActive) throw HttpError.badRequest('Mã giảm giá đã ngừng áp dụng.');
  if (coupon.budgetVnd !== null && coupon.budgetVnd !== undefined && coupon.budgetUsedVnd >= coupon.budgetVnd)
    throw HttpError.badRequest('Chương trình khuyến mãi đã hết ngân sách.');
  if (new Date(coupon.startDate).getTime() > now) throw HttpError.badRequest('Mã giảm giá chưa đến thời gian áp dụng.');
  if (new Date(coupon.expirationDate).getTime() < now) throw HttpError.badRequest('Mã giảm giá đã hết hạn.');
  if (coupon.usageLimit !== null && coupon.usageLimit !== undefined && coupon.usageCount >= coupon.usageLimit) {
    throw HttpError.badRequest('Mã giảm giá đã hết lượt sử dụng.');
  }
  if (coupon.minOrderVnd > 0 && subtotal < coupon.minOrderVnd) {
    throw HttpError.badRequest(`Mã giảm giá áp dụng cho đơn hàng từ ${formatVND(coupon.minOrderVnd)}.`);
  }
  return coupon;
};

export default class CouponService implements BaseServiceInterface<CouponModel> {
  findByPk(id: string | number): Promise<CouponModel | null> {
    return CouponModel.findByPk(id);
  }

  findAll(): Promise<CouponModel[]> {
    return CouponModel.findAll({ order: [['id', 'ASC']] });
  }

  insert(data: Record<string, unknown>): Promise<CouponModel> {
    return this.create(data);
  }

  bulkInsert(): Promise<CouponModel[] | null> {
    throw new Error('Method not implemented.');
  }

  // Customer check before checkout, for the cart's current subtotal; the order placement validates the coupon again.
  async validateForCheckout(rawCode: unknown, rawSubtotal: unknown, userId?: number) {
    const subtotal = toInteger(rawSubtotal);
    if (subtotal === undefined || subtotal < 0) throw HttpError.badRequest('Tổng tiền hàng không hợp lệ.');
    const coupon = assertCouponUsable(
      await CouponModel.findOne({ where: { code: normalizeCouponCode(rawCode) } }),
      subtotal,
      userId,
    );
    return {
      code: coupon.code,
      title: coupon.title,
      description: coupon.description,
      discountPercent: coupon.discountPercent,
      minOrderVnd: coupon.minOrderVnd,
      expirationDate: coupon.expirationDate,
      fixedAmountVnd: coupon.fixedAmountVnd || 0,
      maxDiscountVnd: coupon.maxDiscountVnd ?? null,
      cartType: coupon.cartType,
      profitGuard: coupon.profitGuard,
      benefitType: coupon.benefitType,
      maxShippingVnd: coupon.maxShippingVnd ?? null,
    };
  }

  async list({ q, status, limit, offset, sortKey, sortDirection }: CouponListQuery) {
    const conditions: WhereOptions[] = [];
    const search = asTrimmedString(q);
    if (search) {
      conditions.push({
        [Op.or]: [{ code: { [Op.iLike]: `%${search}%` } }, { title: { [Op.iLike]: `%${search}%` } }],
      });
    }
    const now = new Date();
    if (status === 'active') {
      conditions.push({ isActive: true, startDate: { [Op.lte]: now }, expirationDate: { [Op.gte]: now } });
    }
    if (status === 'expired') conditions.push({ expirationDate: { [Op.lt]: now } });
    if (status === 'inactive') conditions.push({ isActive: false });
    const column = sortKey && SORTABLE_COLUMNS.includes(sortKey) ? sortKey : 'id';
    return CouponModel.findAndCountAll({
      where: { [Op.and]: conditions },
      limit,
      offset,
      order: [[column, sortDirection === 'asc' ? 'ASC' : 'DESC']],
    });
  }

  private async validate(data: Record<string, unknown>, current?: CouponModel) {
    const code = normalizeCouponCode(data.code);
    const title = asTrimmedString(data.title);
    const discountPercent = toInteger(data.discountPercent);
    const usageLimit = data.usageLimit === null || data.usageLimit === '' ? null : toInteger(data.usageLimit);
    const minOrderVnd = data.minOrderVnd === undefined || data.minOrderVnd === '' ? 0 : toInteger(data.minOrderVnd);
    const startDate = new Date(asTrimmedString(data.startDate));
    const expirationDate = new Date(asTrimmedString(data.expirationDate));

    const errors: string[] = [];
    if (!CODE_PATTERN.test(code)) errors.push('Mã phải gồm 3-30 ký tự chữ in hoa, số, "-" hoặc "_".');
    if (!title) errors.push('Tiêu đề không được để trống.');
    // A free-shipping code takes money off the shipping fee (up to its cap), not a percentage of the goods.
    const benefitType = data.benefitType === 'freeship' ? 'freeship' : 'discount';
    if (benefitType === 'discount' && (discountPercent === undefined || discountPercent < 1 || discountPercent > 100)) {
      errors.push('Phần trăm giảm giá phải từ 1 đến 100.');
    }
    const maxShippingVnd =
      benefitType === 'freeship' ? (data.maxShippingVnd === '' ? undefined : toInteger(data.maxShippingVnd)) : null;
    if (
      benefitType === 'freeship' &&
      (maxShippingVnd === undefined || maxShippingVnd === null || maxShippingVnd < 1 || maxShippingVnd > 500_000)
    )
      errors.push('Mã freeship cần mức giảm phí vận chuyển tối đa (1–500.000đ).');
    const requiresClaim = data.requiresClaim === true;
    const claimLimit =
      data.claimLimit === null || data.claimLimit === undefined || data.claimLimit === ''
        ? null
        : toInteger(data.claimLimit);
    if (claimLimit === undefined || (claimLimit !== null && claimLimit < 1))
      errors.push('Số lượt lưu phải là số nguyên dương hoặc để trống.');
    const minTier =
      TIER_ORDER.includes(String(data.minTier) as (typeof TIER_ORDER)[number]) && data.minTier !== 'MEMBER'
        ? String(data.minTier)
        : null;
    if (usageLimit === undefined || (usageLimit !== null && usageLimit < 1)) {
      errors.push('Giới hạn sử dụng phải là số nguyên dương hoặc để trống (không giới hạn).');
    }
    if (minOrderVnd === undefined || minOrderVnd < 0) {
      errors.push('Đơn hàng tối thiểu phải là số tiền nguyên (VND) không âm, hoặc để trống.');
    }
    if (current && usageLimit && usageLimit < current.usageCount) {
      errors.push(`Giới hạn sử dụng không được nhỏ hơn số lần đã dùng (${current.usageCount}).`);
    }
    if (isNaN(startDate.getTime())) errors.push('Ngày bắt đầu không hợp lệ.');
    if (isNaN(expirationDate.getTime())) errors.push('Ngày hết hạn không hợp lệ.');
    if (!isNaN(startDate.getTime()) && !isNaN(expirationDate.getTime()) && startDate > expirationDate) {
      errors.push('Ngày hết hạn phải sau ngày bắt đầu.');
    }
    // Voucher rules 4.0 terms.
    const kind = data.kind === 'member_template' ? 'member_template' : 'standard';
    const profitGuard = data.profitGuard === true || kind === 'member_template';
    const optionalAmount = (value: unknown) =>
      value === null || value === undefined || value === '' ? null : toInteger(value);
    const maxDiscountVnd = optionalAmount(data.maxDiscountVnd),
      budgetVnd = optionalAmount(data.budgetVnd);
    const skuList = (value: unknown) => {
      const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\s,]+/) : [];
      const skus = [...new Set(list.map((sku) => asTrimmedString(sku).toUpperCase()).filter(Boolean))];
      return skus.length ? skus.slice(0, 500) : null;
    };
    const eligibleSkus = skuList(data.eligibleSkus),
      excludedSkus = skuList(data.excludedSkus);
    const cartType = ['single', 'basket'].includes(String(data.cartType))
      ? (data.cartType as 'single' | 'basket')
      : 'any';
    if (
      benefitType === 'discount' &&
      profitGuard &&
      discountPercent !== undefined &&
      (discountPercent < VOUCHER_MIN_PERCENT || discountPercent > VOUCHER_MAX_PERCENT)
    )
      errors.push(`Voucher có bảo vệ lợi nhuận phải giảm từ ${VOUCHER_MIN_PERCENT}% đến ${VOUCHER_MAX_PERCENT}%.`);
    if (maxDiscountVnd === undefined || (maxDiscountVnd !== null && maxDiscountVnd < 1))
      errors.push('Mức giảm tối đa phải là số tiền nguyên dương hoặc để trống.');
    if (budgetVnd === undefined || (budgetVnd !== null && budgetVnd < 1))
      errors.push('Ngân sách phải là số tiền nguyên dương hoặc để trống.');
    if (current && budgetVnd !== null && budgetVnd !== undefined && budgetVnd < current.budgetUsedVnd)
      errors.push(`Ngân sách không được nhỏ hơn số đã dùng (${current.budgetUsedVnd}).`);
    if (errors.length > 0) throw HttpError.badRequest('Thông tin khuyến mãi chưa hợp lệ.', errors);

    const duplicate = await CouponModel.findOne({ where: { code } });
    if (duplicate && duplicate.id !== current?.id) throw HttpError.conflict('Mã khuyến mãi đã tồn tại.');

    return {
      code,
      title,
      description: asTrimmedString(data.description) || null,
      discountPercent: benefitType === 'freeship' ? 0 : (discountPercent as number),
      benefitType,
      maxShippingVnd,
      requiresClaim: kind === 'standard' && requiresClaim,
      claimLimit: requiresClaim ? claimLimit : null,
      minTier,
      usageLimit,
      minOrderVnd: minOrderVnd as number,
      startDate,
      expirationDate,
      isActive: data.isActive === undefined ? true : data.isActive === true,
      kind,
      profitGuard,
      maxDiscountVnd: maxDiscountVnd as number | null,
      budgetVnd: budgetVnd as number | null,
      eligibleSkus,
      excludedSkus,
      cartType,
      // A template is never typed by customers; members claim their own monthly code from it.
      isPublic: kind === 'standard' && data.isPublic === true,
    };
  }

  private async audit(
    actorUserId: number | null,
    couponId: number,
    action: string,
    oldValue: Record<string, unknown> | null,
    newValue: Record<string, unknown> | null,
  ) {
    await PromotionAuditModel.create({
      actorUserId,
      entityType: 'coupon',
      entityId: couponId,
      action,
      oldValue,
      newValue,
    });
  }

  async create(data: Record<string, unknown>, actorUserId: number | null = null): Promise<CouponModel> {
    const coupon = await CouponModel.create(await this.validate(data));
    await this.audit(actorUserId, coupon.id, 'create', null, coupon.get({ plain: true }));
    return coupon;
  }

  async update(id: number, data: Record<string, unknown>, actorUserId: number | null = null): Promise<CouponModel> {
    const coupon = await CouponModel.findByPk(id);
    if (!coupon) throw HttpError.notFound('Không tìm thấy mã khuyến mãi.');
    if (coupon.source === 'loyalty' || coupon.source === 'member')
      throw HttpError.conflict('Issued member rewards cannot be edited.', 'COUPON_REWARD_IMMUTABLE');
    const before = coupon.get({ plain: true });
    await coupon.update(await this.validate(data, coupon));
    await this.audit(actorUserId, coupon.id, 'update', before, coupon.get({ plain: true }));
    return coupon;
  }

  async remove(id: number): Promise<void> {
    const coupon = await CouponModel.findByPk(id);
    if (!coupon) throw HttpError.notFound('Không tìm thấy mã khuyến mãi.');
    if (coupon.source === 'loyalty' || coupon.source === 'member')
      throw HttpError.conflict('Issued member rewards cannot be deleted.', 'COUPON_REWARD_IMMUTABLE');
    if (coupon.kind === 'member_template' && (await CouponModel.count({ where: { templateId: coupon.id } })) > 0)
      throw HttpError.conflict('Codes were issued from this template; pause it instead.', 'COUPON_IN_USE');
    if (coupon.usageCount > 0) {
      throw HttpError.conflict('Codes used by orders must be paused instead of deleted.', 'COUPON_IN_USE');
    }
    await coupon.destroy();
  }
}
