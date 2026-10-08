import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import ReservationService from '../../core/server/services/ReservationService';
import HttpError from '../../shared/server/utils/HttpError';

@Controller('/reservations')
export default class ReservationController extends ApiBaseController {
  private reservations = new ReservationService();
  private user(req: Request) {
    if (!req.user) throw HttpError.unauthorized();
    return req.user.id;
  }
  @Get('/')
  async list(req: Request, res: Response) {
    try { return res.json(await this.reservations.list(this.user(req))); }
    catch (error) { return this.handleError(res, error, 'Reservations'); }
  }
  @Get('/notifications')
  async notifications(req: Request, res: Response) {
    try { return res.json(await this.reservations.notifications(this.user(req))); }
    catch (error) { return this.handleError(res, error, 'Reservation notifications'); }
  }
  @Get('/:id')
  async detail(req: Request, res: Response) {
    try { return res.json(await this.reservations.detail(Number(req.params.id), this.user(req))); }
    catch (error) { return this.handleError(res, error, 'Reservation'); }
  }
  @Post('/')
  async create(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.reservations.create(this.user(req), req.body || {}), undefined, 201); }
    catch (error) { return this.handleError(res, error, 'Reservation request'); }
  }
  @Post('/:id/delivery')
  async delivery(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.reservations.requestDelivery(Number(req.params.id), this.user(req), req.body || {})); }
    catch (error) { return this.handleError(res, error, 'Reservation delivery'); }
  }
  @Post('/:id/evidence')
  async evidence(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.reservations.attachEvidence(Number(req.params.id), this.user(req), req.body?.evidenceIds)); }
    catch (error) { return this.handleError(res, error, 'Reservation evidence'); }
  }
  @Post('/:id/cancel-delivery')
  async cancelDelivery(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.reservations.cancelDeliveryRequest(Number(req.params.id), this.user(req))); }
    catch (error) { return this.handleError(res, error, 'Cancel reservation delivery'); }
  }
  @Post('/:id/cancel')
  async cancel(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.reservations.cancel(Number(req.params.id), this.user(req), req.body || {}, true)); }
    catch (error) { return this.handleError(res, error, 'Cancel reservation'); }
  }
}
