import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import CustomerNotificationService from '../../core/server/services/CustomerNotificationService';
import HttpError from '../../shared/server/utils/HttpError';

@Controller('/notifications')
export default class CustomerNotificationController extends ApiBaseController {
  private service = new CustomerNotificationService();
  private user(req: Request) { if (!req.user?.id) throw HttpError.unauthorized(); return req.user.id; }
  @Get('/') async list(req: Request, res: Response) {
    try { return res.json(await this.service.list(this.user(req), Number(req.query.offset || 0))); } catch (error) { return this.handleError(res, error, 'Customer inbox'); }
  }
  @Post('/:id/read') async read(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.service.read(this.user(req), Number(req.params.id))); } catch (error) { return this.handleError(res, error, 'Read customer notification'); }
  }
  @Get('/restocks') async subscriptions(req: Request, res: Response) {
    try { return res.json(await this.service.subscriptions(this.user(req))); } catch (error) { return this.handleError(res, error, 'Restock preferences'); }
  }
  @Post('/restocks/:id') async subscribe(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.service.subscribe(this.user(req), Number(req.params.id), req.body?.active)); } catch (error) { return this.handleError(res, error, 'Change restock preference'); }
  }
}
