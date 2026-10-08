import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import LoyaltyService from '../../core/server/services/LoyaltyService';
import HttpError from '../../shared/server/utils/HttpError';

@Controller('/admin/loyalty')
export default class AdminLoyaltyController extends ApiBaseController {
  private service = new LoyaltyService();
  private admin(req: Request) { if (!req.user) throw HttpError.unauthorized(); if(req.user.role !== 'ADMIN') throw HttpError.forbidden(); return req.user.id; }
  @Get('/')
  async queues(req: Request,res: Response) {
    try { return res.json(await this.service.queues(this.admin(req))); }
    catch(error) { return this.handleError(res,error,'Membership queues'); }
  }
  @Get('/claims/:id')
  async detail(req: Request,res: Response) {
    try { return res.json(await this.service.claimDetail(Number(req.params.id),this.admin(req),true)); }
    catch(error) { return this.handleError(res,error,'Claim review'); }
  }
  @Post('/claims/:id/review')
  async review(req: Request,res: Response) {
    try { return this.sendSuccess(res,await this.service.reviewClaim(Number(req.params.id),this.admin(req),req.body || {})); }
    catch(error) { return this.handleError(res,error,'Claim decision'); }
  }
  @Post('/gifts')
  async createGift(req: Request,res: Response) {
    try { return this.sendSuccess(res,await this.service.createGift(this.admin(req),req.body || {}),undefined,201); }
    catch(error) { return this.handleError(res,error,'Configure stock gift'); }
  }
  @Post('/adjustments')
  async adjust(req: Request,res: Response) {
    try { return this.sendSuccess(res,await this.service.adjust(this.admin(req),req.body || {})); }
    catch(error) { return this.handleError(res,error,'Audited points adjustment'); }
  }
  @Post('/gifts/:id/fulfill')
  async fulfill(req: Request,res: Response) {
    try { return this.sendSuccess(res,await this.service.fulfillGift(Number(req.params.id),this.admin(req),req.body || {})); }
    catch(error) { return this.handleError(res,error,'Gift handover'); }
  }
  @Post('/orders/:id/refunds')
  async refund(req: Request,res: Response) {
    try { return this.sendSuccess(res,await this.service.confirmRefund(Number(req.params.id),this.admin(req),req.body || {})); }
    catch(error) { return this.handleError(res,error,'Verified order refund'); }
  }
}
