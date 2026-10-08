import { Op, WhereOptions } from 'sequelize';
import CouponModel from '../database/client/models/Coupon.Model';
import { BaseServiceInterface } from './BaseServiceInterface';
import HttpError from '../../../shared/server/utils/HttpError';
import { asTrimmedString, toInteger } from '../../../shared/server/utils/ValidationUtils';
import { formatVND } from '../../../shared/server/utils/utils';

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
  listPrice: number;
  salePrice: number;
  quantity: number;
}

// The coupon's discount on these lines (whole VND).
export const couponDiscount = (coupon: Pick<CouponModel, 'discountPercent' | 'source'> & Partial<Pick<CouponModel,'fixedAmountVnd'|'maxDiscountVnd'>>, lines: PricedLine[]) => {
  const subtotal = lines.reduce((sum, line) => sum + line.salePrice * line.quantity, 0);
  if (coupon.source === 'loyalty') {
    if (lines.some(line => line.salePrice < line.listPrice)) throw HttpError.conflict('Choose either the sale price or a member reward; benefits cannot be combined.','BENEFIT_CONFLICT');
    const benefit = coupon.fixedAmountVnd || calculateDiscount(subtotal,coupon.discountPercent);
    return Math.max(0,Math.min(benefit,coupon.maxDiscountVnd ?? benefit,Math.floor(subtotal/2)));
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
  if (coupon.ownerUserId && coupon.ownerUserId !== userId) throw HttpError.notFound('This reward belongs to another collector.');
  if (coupon.source === 'loyalty' && (coupon.reservedOrderId || coupon.usedAt)) throw HttpError.conflict('This reward is already reserved or used.','REWARD_UNAVAILABLE');
  if (!coupon.isActive) throw HttpError.badRequest('Mã giảm giá đã ngừng áp dụng.');
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
      fixedAmountVnd:coupon.fixedAmountVnd || 0,
      maxDiscountVnd:coupon.maxDiscountVnd ?? null,
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
    if (discountPercent === undefined || discountPercent < 1 || discountPercent > 100) {
      errors.push('Phần trăm giảm giá phải từ 1 đến 100.');
    }
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
    if (errors.length > 0) throw HttpError.badRequest('Thông tin khuyến mãi chưa hợp lệ.', errors);

    const duplicate = await CouponModel.findOne({ where: { code } });
    if (duplicate && duplicate.id !== current?.id) throw HttpError.conflict('Mã khuyến mãi đã tồn tại.');

    return {
      code,
      title,
      description: asTrimmedString(data.description) || null,
      discountPercent: discountPercent as number,
      usageLimit,
      minOrderVnd: minOrderVnd as number,
      startDate,
      expirationDate,
      isActive: data.isActive === undefined ? true : data.isActive === true,
    };
  }

  async create(data: Record<string, unknown>): Promise<CouponModel> {
    return CouponModel.create(await this.validate(data));
  }

  async update(id: number, data: Record<string, unknown>): Promise<CouponModel> {
    const coupon = await CouponModel.findByPk(id);
    if (!coupon) throw HttpError.notFound('Không tìm thấy mã khuyến mãi.');
    if (coupon.source === 'loyalty') throw HttpError.conflict('Issued member rewards cannot be edited.');
    return coupon.update(await this.validate(data, coupon));
  }

  async remove(id: number): Promise<void> {
    const coupon = await CouponModel.findByPk(id);
    if (!coupon) throw HttpError.notFound('Không tìm thấy mã khuyến mãi.');
    if (coupon.source === 'loyalty') throw HttpError.conflict('Issued member rewards cannot be deleted.');
    if (coupon.usageCount > 0) {
      throw HttpError.conflict('Mã đã được sử dụng trong đơn hàng, hãy tạm dừng thay vì xoá.');
    }
    await coupon.destroy();
  }
}
