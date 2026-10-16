import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import VoucherService from '../../core/server/services/VoucherService';
import NotificationDispatchService from '../../core/server/services/NotificationDispatchService';
import { toInteger } from '../../shared/server/utils/ValidationUtils';

// Pricing calculator and voucher simulation, and the shop's operational alerts (the Zalo fallback).
@Controller('/admin/pricing')
export default class AdminPricingController extends ApiBaseController {
  private vouchers = new VoucherService();
  private notices = new NotificationDispatchService();
  @Post('/calculate')
  async calculate(req: Request, res: Response) {
    try { return res.json(this.vouchers.calculate(req.body || {})); }
    catch (error) { return this.handleError(res, error, 'Pricing calculator'); }
  }
  @Get('/coupons/:id/simulate')
  async simulate(req: Request, res: Response) {
    try { return res.json(await this.vouchers.simulate(toInteger(req.params.id) || 0)); }
    catch (error) { return this.handleError(res, error, 'Voucher simulation'); }
  }
  @Get('/alerts')
  async alerts(req: Request, res: Response) {
    try {
      const value = String(req.query.status);
      const status = value === 'resolved' || value === 'all' ? value : 'open';
      return res.json(await this.notices.listAlerts(status));
    } catch (error) { return this.handleError(res, error, 'Admin alerts'); }
  }
  @Post('/alerts/:id/resolve')
  async resolve(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.notices.resolveAlert(toInteger(req.params.id) || 0, req.user!.id)); }
    catch (error) { return this.handleError(res, error, 'Resolve admin alert'); }
  }
  @Post('/deliveries/:id/retry')
  async retry(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.notices.retryDelivery(toInteger(req.params.id) || 0)); }
    catch (error) { return this.handleError(res, error, 'Retry notification delivery'); }
  }
}
