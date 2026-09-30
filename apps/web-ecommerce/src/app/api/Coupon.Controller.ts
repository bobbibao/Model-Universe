import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type CouponService from '../../core/server/services/CouponService';

@Controller('/coupons')
@ControllerModel('CouponModel')
export default class CouponController extends ApiBaseController {
  @Get('/:code/validate')
  async validateCoupon(req: Request, res: Response) {
    try {
      const service = await this.requireService<CouponService>();
      return res.json(await service.validateForCheckout(req.params.code, req.query.subtotal));
    } catch (error) {
      return this.handleError(res, error, "CouponController's validateCoupon");
    }
  }
}
