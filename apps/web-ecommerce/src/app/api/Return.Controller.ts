import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type ReturnService from '../../core/server/services/ReturnService';
import HttpError from '../../shared/server/utils/HttpError';
import { toInteger } from '../../shared/server/utils/ValidationUtils';

// Customer returns (login required, see Auth.Route).
@Controller('/returns')
@ControllerModel('ReturnModel')
export default class ReturnController extends ApiBaseController {
  @Get('/orders/:orderId')
  async getForOrder(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      const service = await this.requireService<ReturnService>();
      return res.json(await service.getForOrder(req.user.id, toInteger(req.params.orderId) || 0));
    } catch (error) {
      return this.handleError(res, error, "ReturnController's getForOrder");
    }
  }

  @Post('/')
  async createReturn(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      const service = await this.requireService<ReturnService>();
      const request = await service.create(req.user.id, req.body || {});
      return this.sendSuccess(res, request, 'Đã gửi yêu cầu trả hàng. Cửa hàng sẽ liên hệ để nhận hàng.', 201);
    } catch (error) {
      return this.handleError(res, error, "ReturnController's createReturn");
    }
  }
}
