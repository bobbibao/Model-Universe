import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import PromotionService from '../../core/server/services/PromotionService';
import HttpError from '../../shared/server/utils/HttpError';
import { toInteger } from '../../shared/server/utils/ValidationUtils';

// The promotions hub: voucher drops, daily check-in, the lucky wheel and missions
// (src/shared/promotions.ts). The hub itself is public; every action needs a signed-in customer.
@Controller('/promotions')
export default class PromotionController extends ApiBaseController {
  private service = new PromotionService();
  private user(req: Request) {
    if (!req.user) throw HttpError.unauthorized();
    return req.user.id;
  }

  @Get('/hub')
  async hub(req: Request, res: Response) {
    try {
      return res.json(await this.service.hub(req.user?.id));
    } catch (error) {
      return this.handleError(res, error, 'Promotions hub');
    }
  }

  @Post('/checkin')
  async checkin(req: Request, res: Response) {
    try {
      return this.sendSuccess(res, await this.service.checkin(this.user(req)));
    } catch (error) {
      return this.handleError(res, error, 'Daily check-in');
    }
  }

  @Post('/wheel')
  async spin(req: Request, res: Response) {
    try {
      return this.sendSuccess(res, await this.service.spin(this.user(req)));
    } catch (error) {
      return this.handleError(res, error, 'Lucky wheel');
    }
  }

  @Post('/missions/:key')
  async mission(req: Request, res: Response) {
    try {
      return this.sendSuccess(res, await this.service.claimMission(this.user(req), String(req.params.key)));
    } catch (error) {
      return this.handleError(res, error, 'Mission reward');
    }
  }

  @Post('/vouchers/:id/claim')
  async claim(req: Request, res: Response) {
    try {
      return this.sendSuccess(res, await this.service.claimVoucher(this.user(req), toInteger(req.params.id) || 0));
    } catch (error) {
      return this.handleError(res, error, 'Save voucher');
    }
  }
}
