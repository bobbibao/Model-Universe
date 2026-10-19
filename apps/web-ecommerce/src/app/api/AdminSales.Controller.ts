import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import SaleCampaignService from '../../core/server/services/SaleCampaignService';

@Controller('/admin/sales')
export default class AdminSalesController extends ApiBaseController {
  private sales = new SaleCampaignService();
  @Get('') async list(_req: Request, res: Response) {
    try {
      return res.json(await this.sales.admin());
    } catch (error) {
      return this.handleError(res, error, 'List sale events');
    }
  }
  @Get('/candidates') async candidates(_req: Request, res: Response) {
    try {
      return res.json(await this.sales.candidates());
    } catch (error) {
      return this.handleError(res, error, 'Sale candidates');
    }
  }
  @Post('') async create(req: Request, res: Response) {
    try {
      return res.json(await this.sales.create(req.body || {}, req.user!.id));
    } catch (error) {
      return this.handleError(res, error, 'Create sale event');
    }
  }
  @Post('/weekly-rule') async rule(req: Request, res: Response) {
    try {
      return res.json(await this.sales.saveRule(req.body || {}, req.user!.id));
    } catch (error) {
      return this.handleError(res, error, 'Weekly sale settings');
    }
  }
  @Post('/:id/cancel') async cancel(req: Request, res: Response) {
    try {
      return res.json(await this.sales.cancel(Number(req.params.id), req.user!.id));
    } catch (error) {
      return this.handleError(res, error, 'Stop sale event');
    }
  }
}
