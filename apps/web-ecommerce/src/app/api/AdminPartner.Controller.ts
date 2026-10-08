import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import PartnerService from '../../core/server/services/PartnerService';
import HttpError from '../../shared/server/utils/HttpError';

@Controller('/admin/partners')
export default class AdminPartnerController extends ApiBaseController {
  private service = new PartnerService();
  private user(req: Request) {
    if (!req.user) throw HttpError.unauthorized();
    return req.user.id;
  }
  @Get('/')
  async list(req: Request, res: Response) {
    try {
      return res.json(await this.service.list(this.user(req), Number(req.query.offset || 0)));
    } catch (error) {
      return this.handleError(res, error, 'Partner verification queue');
    }
  }
  @Get('/:id')
  async detail(req: Request, res: Response) {
    try {
      return res.json(await this.service.detail(Number(req.params.id), this.user(req), true));
    } catch (error) {
      return this.handleError(res, error, 'Private partner verification details');
    }
  }
  @Post('/:id/actions')
  async act(req: Request, res: Response) {
    try {
      return this.sendSuccess(res, await this.service.act(Number(req.params.id), this.user(req), req.body || {}, true));
    } catch (error) {
      return this.handleError(res, error, 'Partner verification decision');
    }
  }
}
