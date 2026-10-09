import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import SellerStoreService from '../../core/server/services/SellerStoreService';

@Controller('/sellers')
export default class SellerStoreController extends ApiBaseController {
  @Get('/:id')
  async storefront(req: Request, res: Response) {
    try { return res.json(await new SellerStoreService().get(Number(req.params.id), Number(req.query.offset || 0))); }
    catch (error) { return this.handleError(res, error, 'Public seller storefront'); }
  }
}
