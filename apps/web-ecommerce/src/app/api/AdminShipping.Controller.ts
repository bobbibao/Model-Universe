import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Put } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import ShippingService from '../../core/server/services/ShippingService';

// The shop's GHN sender/return address and delivery defaults.
@Controller('/admin/shipping')
export default class AdminShippingController extends ApiBaseController {
  private service = new ShippingService();
  @Get('/origin')
  async origin(_req: Request, res: Response) {
    try {
      return res.json({ origin: await this.service.origin(), config: this.service.config() });
    } catch (error) {
      return this.handleError(res, error, 'Shipping origin');
    }
  }
  @Put('/origin')
  async save(req: Request, res: Response) {
    try {
      return this.sendSuccess(res, await this.service.saveOrigin(req.user!.id, req.body || {}));
    } catch (error) {
      return this.handleError(res, error, 'Save shipping origin');
    }
  }
}
