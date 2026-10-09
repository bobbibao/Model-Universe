import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import PawnService from '../../core/server/services/PawnService';
import PawnDisposalService from '../../core/server/services/PawnDisposalService';
import HttpError from '../../shared/server/utils/HttpError';

@Controller('/pawn')
export default class PawnController extends ApiBaseController {
  private service = new PawnService();
  private user(req: Request) { if (!req.user) throw HttpError.unauthorized(); return req.user.id; }
  @Get('/')
  async list(req: Request, res: Response) {
    try { return res.json(await this.service.list(this.user(req))); }
    catch (error) { return this.handleError(res, error, 'Customer pawn requests'); }
  }
  @Get('/notifications')
  async notifications(req: Request, res: Response) {
    try { return res.json(await this.service.notifications(this.user(req))); }
    catch (error) { return this.handleError(res, error, 'Pawn deadline notifications'); }
  }
  @Get('/:id')
  async detail(req: Request, res: Response) {
    try { return res.json(await this.service.detail(Number(req.params.id), this.user(req))); }
    catch (error) { return this.handleError(res, error, 'Customer pawn contract'); }
  }
  @Post('/')
  async create(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.service.create(this.user(req), req.body || {}), undefined, 201); }
    catch (error) { return this.handleError(res, error, 'Pawn submission'); }
  }
  @Post('/:id/actions')
  async act(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.service.act(Number(req.params.id), this.user(req), req.body || {})); }
    catch (error) { return this.handleError(res, error, 'Pawn customer decision'); }
  }
  @Post('/:id/disposal/decision')
  async disposalDecision(req: Request, res: Response) {
    try {
      await new PawnDisposalService().decide(Number(req.params.id), this.user(req), req.body || {});
      return this.sendSuccess(res, await this.service.detail(Number(req.params.id), this.user(req)));
    } catch (error) { return this.handleError(res, error, 'Pawn disposal customer agreement'); }
  }
}
