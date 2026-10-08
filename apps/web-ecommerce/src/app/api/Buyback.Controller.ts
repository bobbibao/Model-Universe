import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import BuybackService from '../../core/server/services/BuybackService';
import HttpError from '../../shared/server/utils/HttpError';

@Controller('/buyback')
export default class BuybackController extends ApiBaseController {
  private service = new BuybackService();
  private user(req: Request) { if (!req.user) throw HttpError.unauthorized(); return req.user.id; }
  @Get('/')
  async list(req: Request, res: Response) {
    try { return res.json(await this.service.list(this.user(req))); }
    catch (error) { return this.handleError(res, error, 'Customer buyback requests'); }
  }
  @Get('/:id')
  async detail(req: Request, res: Response) {
    try { return res.json(await this.service.detail(Number(req.params.id), this.user(req))); }
    catch (error) { return this.handleError(res, error, 'Customer buyback request'); }
  }
  @Post('/')
  async create(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.service.create(this.user(req), req.body || {}), undefined, 201); }
    catch (error) { return this.handleError(res, error, 'Buyback submission'); }
  }
  @Post('/:id/actions')
  async act(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.service.act(Number(req.params.id), this.user(req), req.body || {})); }
    catch (error) { return this.handleError(res, error, 'Buyback customer decision'); }
  }
}
