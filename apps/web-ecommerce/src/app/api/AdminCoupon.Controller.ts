import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Delete, Get, Post, Put } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type CouponService from '../../core/server/services/CouponService';
import { parsePagination, toPaginatedPayload } from '../../shared/server/utils/PaginationUtils';
import { toInteger } from '../../shared/server/utils/ValidationUtils';

@Controller('/admin/coupons')
@ControllerModel('CouponModel')
export default class AdminCouponController extends ApiBaseController {
  @Get('/')
  async getCoupons(req: Request, res: Response) {
    try {
      const service = await this.requireService<CouponService>();
      const { page, perPage, limit, offset } = parsePagination(req);
      const { rows, count } = await service.list({
        q: req.query.q as string | undefined,
        status: req.query.status as string | undefined,
        sortKey: req.query.sort as string | undefined,
        sortDirection: req.query.direction as string | undefined,
        limit,
        offset,
      });
      return res.json(toPaginatedPayload(rows, count, page, perPage));
    } catch (error) {
      return this.handleError(res, error, "AdminCouponController's getCoupons");
    }
  }

  @Post('/')
  async createCoupon(req: Request, res: Response) {
    try {
      const service = await this.requireService<CouponService>();
      const coupon = await service.create(req.body || {});
      return this.sendSuccess(res, coupon, 'Thêm khuyến mãi thành công.', 201);
    } catch (error) {
      return this.handleError(res, error, "AdminCouponController's createCoupon");
    }
  }

  @Put('/:id')
  async updateCoupon(req: Request, res: Response) {
    try {
      const service = await this.requireService<CouponService>();
      const coupon = await service.update(toInteger(req.params.id) || 0, req.body || {});
      return this.sendSuccess(res, coupon, 'Cập nhật khuyến mãi thành công.');
    } catch (error) {
      return this.handleError(res, error, "AdminCouponController's updateCoupon");
    }
  }

  @Delete('/:id')
  async deleteCoupon(req: Request, res: Response) {
    try {
      const service = await this.requireService<CouponService>();
      await service.remove(toInteger(req.params.id) || 0);
      return this.sendSuccess(res, undefined, 'Đã xoá khuyến mãi.');
    } catch (error) {
      return this.handleError(res, error, "AdminCouponController's deleteCoupon");
    }
  }
}
