import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import SaleCampaignService from '../../core/server/services/SaleCampaignService';

@Controller('/sales')
export default class SalesController extends ApiBaseController {
  @Get('') async list(_req: Request, res: Response) {
    try {
      res.setHeader('Cache-Control', 'no-store');
      return res.json(await new SaleCampaignService().storefront());
    } catch (error) {
      return this.handleError(res, error, 'Store sale events');
    }
  }
}
