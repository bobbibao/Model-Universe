import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import CustomerAddressService from '../../core/server/services/CustomerAddressService';
import HttpError from '../../shared/server/utils/HttpError';

@Controller('/addresses')
export default class CustomerAddressController extends ApiBaseController {
  private service = new CustomerAddressService();
  private user(req: Request) { if (!req.user?.id) throw HttpError.unauthorized(); return req.user.id; }
  @Get('/') async list(req: Request, res: Response) {
    try { return res.json(await this.service.list(this.user(req))); } catch (error) { return this.handleError(res, error, 'Customer delivery addresses'); }
  }
  @Post('/') async save(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.service.save(this.user(req), req.body || {})); } catch (error) { return this.handleError(res, error, 'Save customer address'); }
  }
  @Post('/:id/remove') async remove(req: Request, res: Response) {
    try { return this.sendSuccess(res, await this.service.remove(this.user(req), Number(req.params.id), req.body?.expectedVersion)); } catch (error) { return this.handleError(res, error, 'Remove customer address'); }
  }
}
