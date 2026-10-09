import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type ReturnService from '../../core/server/services/ReturnService';
import HttpError from '../../shared/server/utils/HttpError';
import { toInteger } from '../../shared/server/utils/ValidationUtils';
import SupportResolutionService from '../../core/server/services/SupportResolutionService';
import { apiReturnMessage } from '../../shared/server/utils/ApiLocale';

// Customer returns (login required, see Auth.Route).
@Controller('/returns')
@ControllerModel('ReturnModel')
export default class ReturnController extends ApiBaseController {
  private support = new SupportResolutionService();
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
      return this.sendSuccess(res, request, apiReturnMessage(req, 'toastCreated'), 201);
    } catch (error) {
      return this.handleError(res, error, "ReturnController's createReturn");
    }
  }

  @Get('/:id')
  async detail(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      return res.json(await this.support.detail(toInteger(req.params.id) || 0, req.user.id));
    } catch (error) {
      return this.handleError(res, error, 'Customer support case');
    }
  }
  @Post('/:id/decision')
  async decide(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      return this.sendSuccess(
        res,
        await this.support.decide(toInteger(req.params.id) || 0, req.user.id, req.body || {}),
      );
    } catch (error) {
      return this.handleError(res, error, 'Customer resolution decision');
    }
  }
}
