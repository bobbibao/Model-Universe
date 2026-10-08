import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import PartnerListingService from '../../core/server/services/PartnerListingService';
import HttpError from '../../shared/server/utils/HttpError';
import PartnerGuaranteeService from '../../core/server/services/PartnerGuaranteeService';

@Controller('/admin/partner-listings')
export default class AdminPartnerListingController extends ApiBaseController {
  private service = new PartnerListingService();
  private user(req: Request) {
    if (!req.user) throw HttpError.unauthorized();
    return req.user.id;
  }
  @Get('/:id/guarantee')
  async guarantee(req: Request, res: Response) {
    try {
      return res.json(await new PartnerGuaranteeService().detail(Number(req.params.id), this.user(req), true));
    } catch (error) {
      return this.handleError(res, error, 'Seller guarantee history');
    }
  }
  @Post('/:id/guarantee')
  async guaranteeAction(req: Request, res: Response) {
    try {
      const service = new PartnerGuaranteeService(),
        id = Number(req.params.id),
        userId = this.user(req),
        body = req.body || {};
      return this.sendSuccess(res, await service.confirm(id, userId, body));
    } catch (error) {
      return this.handleError(res, error, 'Verified seller guarantee');
    }
  }
  @Get('/')
  async list(req: Request, res: Response) {
    try {
      return res.json(await this.service.list(this.user(req), Number(req.query.offset || 0), true));
    } catch (error) {
      return this.handleError(res, error, 'Seller listing moderation queue');
    }
  }
  @Get('/:id')
  async detail(req: Request, res: Response) {
    try {
      return res.json(await this.service.detail(Number(req.params.id), this.user(req), true));
    } catch (error) {
      return this.handleError(res, error, 'Seller listing moderation details');
    }
  }
  @Post('/:id/actions')
  async act(req: Request, res: Response) {
    try {
      return this.sendSuccess(res, await this.service.act(Number(req.params.id), this.user(req), req.body || {}, true));
    } catch (error) {
      return this.handleError(res, error, 'Seller listing moderation decision');
    }
  }
}
