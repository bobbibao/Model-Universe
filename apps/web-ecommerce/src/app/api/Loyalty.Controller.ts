import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import LoyaltyService from '../../core/server/services/LoyaltyService';
import HttpError from '../../shared/server/utils/HttpError';

@Controller('/loyalty')
export default class LoyaltyController extends ApiBaseController {
  private service = new LoyaltyService();
  private user(req: Request) { if (!req.user) throw HttpError.unauthorized(); return req.user.id; }
  @Get('/')
  async overview(req: Request,res: Response) {
    try { return res.json(await this.service.overview(this.user(req))); }
    catch(error) { return this.handleError(res,error,'Membership'); }
  }
  @Post('/redeem')
  async redeem(req: Request,res: Response) {
    try { return this.sendSuccess(res,await this.service.redeem(this.user(req),req.body || {})); }
    catch(error) { return this.handleError(res,error,'Reward redemption'); }
  }
  @Post('/claims')
  async claim(req: Request,res: Response) {
    try { return this.sendSuccess(res,await this.service.submitClaim(this.user(req),req.body || {}),undefined,201); }
    catch(error) { return this.handleError(res,error,'Historical transaction claim'); }
  }
  @Get('/claims/:id')
  async detail(req: Request,res: Response) {
    try { return res.json(await this.service.claimDetail(Number(req.params.id),this.user(req))); }
    catch(error) { return this.handleError(res,error,'Historical transaction'); }
  }
  @Post('/gifts/:id/delivery')
  async delivery(req: Request,res: Response) {
    try { return this.sendSuccess(res,await this.service.requestGift(Number(req.params.id),this.user(req),req.body || {})); }
    catch(error) { return this.handleError(res,error,'Gift delivery'); }
  }
}
