import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import ReservationService from '../../core/server/services/ReservationService';
import HttpError from '../../shared/server/utils/HttpError';

@Controller('/admin/reservations')
export default class AdminReservationController extends ApiBaseController {
  private reservations = new ReservationService();
  private admin(req: Request) {
    if (req.user?.role !== 'ADMIN') throw HttpError.forbidden();
    return req.user.id;
  }
  @Get('/')
  async list(req: Request, res: Response) {
    try { this.admin(req); return res.json(await this.reservations.list()); }
    catch (error) { return this.handleError(res, error, 'Reservation queue'); }
  }
  @Get('/expired')
  async expired(req: Request, res: Response) {
    try { this.admin(req); return res.json(await this.reservations.expiryQueue()); }
    catch (error) { return this.handleError(res, error, 'Expired reservation queue'); }
  }
  @Get('/:id')
  async detail(req: Request, res: Response) {
    try { this.admin(req); return res.json(await this.reservations.detail(Number(req.params.id))); }
    catch (error) { return this.handleError(res, error, 'Reservation audit'); }
  }
  @Post('/:id/:action')
  async act(req: Request, res: Response) {
    try {
      const actor = this.admin(req), id = Number(req.params.id), data = req.body || {};
      let result;
      switch (req.params.action) {
        case 'payment': result = await this.reservations.confirmPayment(id, actor, data); break;
        case 'refund': result = await this.reservations.confirmRefund(id, actor, data); break;
        case 'forfeit': result = await this.reservations.confirmForfeit(id, actor, data); break;
        case 'extend': result = await this.reservations.extend(id, actor, data); break;
        case 'cancel': result = await this.reservations.cancel(id, actor, data); break;
        case 'confirm-delivery': result = await this.reservations.confirmDelivery(id, actor); break;
        default: throw HttpError.notFound('Reservation action not found.');
      }
      return this.sendSuccess(res, result);
    } catch (error) { return this.handleError(res, error, 'Reservation action'); }
  }
}
