import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import VoucherService from '../../core/server/services/VoucherService';
import NotificationDispatchService from '../../core/server/services/NotificationDispatchService';
import PricingApprovalService, { type PricingRecordKind } from '../../core/server/services/PricingApprovalService';
import PromotionReconciliationService from '../../core/server/services/PromotionReconciliationService';
import { toInteger } from '../../shared/server/utils/ValidationUtils';
import HttpError from '../../shared/server/utils/HttpError';

// Pricing calculator and voucher simulation, approved prices and cost profiles, the nightly promotion reconciliation,
// and the shop's operational alerts (the Zalo fallback).
@Controller('/admin/pricing')
export default class AdminPricingController extends ApiBaseController {
  private vouchers = new VoucherService();
  private notices = new NotificationDispatchService();
  private approvals = new PricingApprovalService();
  private reconciliation = new PromotionReconciliationService();
  private kind(req: Request): PricingRecordKind {
    const kind = String(req.params.kind);
    if (kind !== 'price' && kind !== 'cost') throw HttpError.badRequest('Unknown pricing record.');
    return kind;
  }
  @Get('/records')
  async records(req: Request, res: Response) {
    try { return res.json(await this.approvals.list(req.query)); }
    catch (error) { return this.handleError(res, error, 'Pricing records'); }
  }
  @Post('/records/price')
  async proposePrice(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.approvals.proposePrice(req.user!.id, req.body || {}), undefined, 201); }
    catch (error) { return this.handleError(res, error, 'Propose a list price'); }
  }
  @Post('/records/cost')
  async proposeCost(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.approvals.proposeCost(req.user!.id, req.body || {}), undefined, 201); }
    catch (error) { return this.handleError(res, error, 'Propose a cost profile'); }
  }
  @Post('/records/:kind/:id/approve')
  async approveRecord(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.approvals.approve(this.kind(req), toInteger(req.params.id) || 0, req.user!.id)); }
    catch (error) { return this.handleError(res, error, 'Approve a pricing record'); }
  }
  @Post('/records/:kind/:id/retire')
  async retireRecord(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.approvals.retire(this.kind(req), toInteger(req.params.id) || 0, req.user!.id)); }
    catch (error) { return this.handleError(res, error, 'Withdraw a pricing record'); }
  }
  @Get('/reconciliation')
  async reconciliations(_req: Request, res: Response) {
    try { return res.json(await this.reconciliation.list()); }
    catch (error) { return this.handleError(res, error, 'Promotion reconciliation'); }
  }
  @Post('/calculate')
  async calculate(req: Request, res: Response) {
    try { return res.json(await this.vouchers.calculate(req.body || {})); }
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
