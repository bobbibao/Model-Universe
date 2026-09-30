import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type ConsentLogService from '../../core/server/services/ConsentLogService';

@Controller('/consent')
@ControllerModel('ConsentLogModel')
export default class ConsentController extends ApiBaseController {
  // Public: the storefront's cookie banner.
  @Post('/')
  async record(req: Request, res: Response) {
    try {
      const service = await this.requireService<ConsentLogService>();
      await service.record(req.body || {});
      return this.sendSuccess(res, undefined, undefined, 201);
    } catch (error) {
      return this.handleError(res, error, "ConsentController's record");
    }
  }
}
