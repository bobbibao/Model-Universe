import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import CommercePolicyService from '../../core/server/services/CommercePolicyService';
import HttpError from '../../shared/server/utils/HttpError';

@Controller('/admin/commerce/policies')
export default class AdminCommercePolicyController extends ApiBaseController {
  private policies = new CommercePolicyService();
  @Get('/')
  async list(req: Request, res: Response) {
    try {
      if (req.user?.role !== 'ADMIN') throw HttpError.forbidden();
      return res.json(await this.policies.list());
    } catch (error) { return this.handleError(res, error, 'Commerce policies'); }
  }
  @Post('/:name/approve')
  async approve(req: Request, res: Response) {
    try {
      if (req.user?.role !== 'ADMIN') throw HttpError.forbidden();
      if (req.body.confirmApproval !== true) throw HttpError.badRequest('Explicit approval confirmation is required.');
      return this.sendSuccess(res, await this.policies.approve(req.params.name, req.body.settings, req.body.version, req.user.id, String(req.body.reason || '')), 'Policy approval recorded.');
    } catch (error) { return this.handleError(res, error, 'Commerce policy approval'); }
  }
}
