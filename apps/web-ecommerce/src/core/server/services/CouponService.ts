import { Op, WhereOptions } from 'sequelize';
import CouponModel from '../database/client/models/Coupon.Model';
import { BaseServiceInterface } from './BaseServiceInterface';
import HttpError from '../../../shared/server/utils/HttpError';
import { asTrimmedString, toInteger } from '../../../shared/server/utils/ValidationUtils';

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

// Throws a user-facing error when the coupon cannot be used right now.
export const assertCouponUsable = (coupon: CouponModel | null): CouponModel => {
  const now = Date.now();
  if (!coupon) throw HttpError.badRequest('Mã giảm giá không tồn tại.');
  if (!coupon.isActive) throw HttpError.badRequest('Mã giảm giá đã ngừng áp dụng.');
  if (new Date(coupon.startDate).getTime() > now) throw HttpError.badRequest('Mã giảm giá chưa đến thời gian áp dụng.');
  if (new Date(coupon.expirationDate).getTime() < now) throw HttpError.badRequest('Mã giảm giá đã hết hạn.');
  if (coupon.usageLimit !== null && coupon.usageLimit !== undefined && coupon.usageCount >= coupon.usageLimit) {
    throw HttpError.badRequest('Mã giảm giá đã hết lượt sử dụng.');
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

  // Customer check before checkout; the order placement validates the coupon again.
  async validateForCheckout(rawCode: unknown) {
    const coupon = assertCouponUsable(await CouponModel.findOne({ where: { code: normalizeCouponCode(rawCode) } }));
    return {
      code: coupon.code,
      title: coupon.title,
      description: coupon.description,
      discountPercent: coupon.discountPercent,
      expirationDate: coupon.expirationDate,
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
    return coupon.update(await this.validate(data, coupon));
  }

  async remove(id: number): Promise<void> {
    const coupon = await CouponModel.findByPk(id);
    if (!coupon) throw HttpError.notFound('Không tìm thấy mã khuyến mãi.');
    if (coupon.usageCount > 0) {
      throw HttpError.conflict('Mã đã được sử dụng trong đơn hàng, hãy tạm dừng thay vì xoá.');
    }
    await coupon.destroy();
  }
}
