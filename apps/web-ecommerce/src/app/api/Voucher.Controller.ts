import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import VoucherService from '../../core/server/services/VoucherService';
import HttpError from '../../shared/server/utils/HttpError';

// The signed-in customer's voucher wallet, monthly member code, best voucher and add-on suggestions.
@Controller('/vouchers')
export default class VoucherController extends ApiBaseController {
  private service = new VoucherService();
  private user(req: Request) {
    if (!req.user) throw HttpError.unauthorized();
    return req.user.id;
  }
  @Get('/')
  async wallet(req: Request, res: Response) {
    try { return res.json(await this.service.wallet(this.user(req))); }
    catch (error) { return this.handleError(res, error, 'Voucher wallet'); }
  }
  @Post('/monthly')
  async claim(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.service.claimMonthly(this.user(req))); }
    catch (error) { return this.handleError(res, error, 'Monthly member voucher'); }
  }
  @Post('/evaluate')
  async evaluate(req: Request, res: Response) {
    try { return res.json(await this.service.evaluateCart(this.user(req), req.body?.items, Math.max(0, Number(req.body?.shippingFeeVnd) || 0))); }
    catch (error) { return this.handleError(res, error, 'Best voucher'); }
  }
  @Post('/add-ons')
  async addOns(req: Request, res: Response) {
    try { return res.json(await this.service.suggestAddOns(this.user(req), req.body?.items)); }
    catch (error) { return this.handleError(res, error, 'Voucher add-on suggestions'); }
  }
}
