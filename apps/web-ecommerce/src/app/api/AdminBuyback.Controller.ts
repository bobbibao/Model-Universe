import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import BuybackService from '../../core/server/services/BuybackService';
import HttpError from '../../shared/server/utils/HttpError';

@Controller('/admin/buyback')
export default class AdminBuybackController extends ApiBaseController {
  private service = new BuybackService();
  private user(req: Request) { if (!req.user) throw HttpError.unauthorized(); return req.user.id; }
  @Get('/')
  async list(req: Request, res: Response) {
    try { return res.json(await this.service.list(this.user(req), true)); }
    catch (error) { return this.handleError(res, error, 'Staff buyback requests'); }
  }
  @Get('/:id')
  async detail(req: Request, res: Response) {
    try { return res.json(await this.service.detail(Number(req.params.id), this.user(req), true)); }
    catch (error) { return this.handleError(res, error, 'Staff buyback request'); }
  }
  @Post('/:id/actions')
  async act(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.service.act(Number(req.params.id), this.user(req), req.body || {}, true)); }
    catch (error) { return this.handleError(res, error, 'Buyback appraisal and custody'); }
  }
  @Post('/:id/payout')
  async payout(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.service.payout(Number(req.params.id), this.user(req), req.body || {})); }
    catch (error) { return this.handleError(res, error, 'Buyback verified payout'); }
  }
  @Post('/:id/intake')
  async intake(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.service.intake(Number(req.params.id), this.user(req), req.body || {})); }
    catch (error) { return this.handleError(res, error, 'Buyback source-linked intake'); }
  }
}
