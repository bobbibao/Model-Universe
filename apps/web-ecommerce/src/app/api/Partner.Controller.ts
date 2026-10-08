import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import PartnerService from '../../core/server/services/PartnerService';
import HttpError from '../../shared/server/utils/HttpError';

@Controller('/partners')
export default class PartnerController extends ApiBaseController {
  private service = new PartnerService();
  private user(req: Request) {
    if (!req.user) throw HttpError.unauthorized();
    return req.user.id;
  }
  @Get('/application')
  async mine(req: Request, res: Response) {
    try {
      return res.json(await this.service.mine(this.user(req)));
    } catch (error) {
      return this.handleError(res, error, 'Owned partner application');
    }
  }
  @Post('/application')
  async submit(req: Request, res: Response) {
    try {
      return this.sendSuccess(res, await this.service.submit(this.user(req), req.body || {}), undefined, 201);
    } catch (error) {
      return this.handleError(res, error, 'Partner verification application');
    }
  }
  @Post('/application/:id/actions')
  async act(req: Request, res: Response) {
    try {
      return this.sendSuccess(res, await this.service.act(Number(req.params.id), this.user(req), req.body || {}));
    } catch (error) {
      return this.handleError(res, error, 'Partner application revision');
    }
  }
}
