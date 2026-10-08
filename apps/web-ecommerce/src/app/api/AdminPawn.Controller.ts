import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import PawnService from '../../core/server/services/PawnService';
import HttpError from '../../shared/server/utils/HttpError';

@Controller('/admin/pawn')
export default class AdminPawnController extends ApiBaseController {
  private service = new PawnService();
  private user(req: Request) { if (!req.user) throw HttpError.unauthorized(); return req.user.id; }
  @Get('/')
  async list(req: Request, res: Response) {
    try { return res.json(await this.service.list(this.user(req), true)); }
    catch (error) { return this.handleError(res, error, 'Staff pawn queue'); }
  }
  @Get('/:id')
  async detail(req: Request, res: Response) {
    try { return res.json(await this.service.detail(Number(req.params.id), this.user(req), true)); }
    catch (error) { return this.handleError(res, error, 'Staff pawn contract'); }
  }
  @Post('/:id/actions')
  async act(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.service.act(Number(req.params.id), this.user(req), req.body || {}, true)); }
    catch (error) { return this.handleError(res, error, 'Pawn agreement and custody'); }
  }
  @Post('/:id/disbursement')
  async disbursement(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.service.payment(Number(req.params.id), this.user(req), req.body || {}, 'disbursement')); }
    catch (error) { return this.handleError(res, error, 'Verified pawn disbursement'); }
  }
  @Post('/:id/redemption')
  async redemption(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.service.payment(Number(req.params.id), this.user(req), req.body || {}, 'redemption')); }
    catch (error) { return this.handleError(res, error, 'Verified pawn redemption'); }
  }
  @Post('/:id/intake')
  async intake(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.service.intake(Number(req.params.id), this.user(req), req.body || {})); }
    catch (error) { return this.handleError(res, error, 'Pawn contractual source intake'); }
  }
}
