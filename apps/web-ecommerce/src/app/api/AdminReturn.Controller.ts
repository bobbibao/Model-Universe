import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Put, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type ReturnService from '../../core/server/services/ReturnService';
import HttpError from '../../shared/server/utils/HttpError';
import { parsePagination, toPaginatedPayload } from '../../shared/server/utils/PaginationUtils';
import { toInteger } from '../../shared/server/utils/ValidationUtils';
import SupportResolutionService from '../../core/server/services/SupportResolutionService';
import { apiReturnMessage } from '../../shared/server/utils/ApiLocale';

@Controller('/admin/returns')
@ControllerModel('ReturnModel')
export default class AdminReturnController extends ApiBaseController {
  private support = new SupportResolutionService();
  private admin(req: Request) {
    if (!req.user) throw HttpError.unauthorized();
    if (req.user.role !== 'ADMIN') throw HttpError.forbidden();
    return req.user.id;
  }
  @Get('/')
  async getReturns(req: Request, res: Response) {
    try {
      const service = await this.requireService<ReturnService>();
      const { page, perPage, limit, offset } = parsePagination(req);
      const { rows, count } = await service.listAdmin(req.query.status as string | undefined, limit, offset);
      return res.json(toPaginatedPayload(rows, count, page, perPage));
    } catch (error) {
      return this.handleError(res, error, "AdminReturnController's getReturns");
    }
  }

  @Get('/:id')
  async getReturn(req: Request, res: Response) {
    try {
      const service = await this.requireService<ReturnService>();
      return res.json(await service.getAdmin(toInteger(req.params.id) || 0));
    } catch (error) {
      return this.handleError(res, error, "AdminReturnController's getReturn");
    }
  }

  @Put('/:id/intake')
  async intake(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      const service = await this.requireService<ReturnService>();
      const request = await service.intake(req.user.id, toInteger(req.params.id) || 0, req.body || {});
      const message = apiReturnMessage(req, request.status === 'RECEIVED' ? 'toastReceived' : 'toastRejected');
      return this.sendSuccess(res, request, message);
    } catch (error) {
      return this.handleError(res, error, "AdminReturnController's intake");
    }
  }

  @Put('/:id/items/:itemId/restock')
  async restock(req: Request, res: Response) {
    try {
      const service = await this.requireService<ReturnService>();
      const request = await service.restockItem(toInteger(req.params.id) || 0, toInteger(req.params.itemId) || 0);
      return this.sendSuccess(res, request, apiReturnMessage(req, 'toastRestocked'));
    } catch (error) {
      return this.handleError(res, error, "AdminReturnController's restock");
    }
  }
  @Get('/:id/resolution')
  async resolution(req: Request, res: Response) {
    try {
      return res.json(await this.support.detail(toInteger(req.params.id) || 0, this.admin(req), true));
    } catch (error) {
      return this.handleError(res, error, 'Support resolution history');
    }
  }
  @Post('/:id/resolution')
  async offer(req: Request, res: Response) {
    try {
      return this.sendSuccess(
        res,
        await this.support.offer(toInteger(req.params.id) || 0, this.admin(req), req.body || {}),
      );
    } catch (error) {
      return this.handleError(res, error, 'Support resolution offer');
    }
  }
  @Post('/:id/resolution/fulfill')
  async fulfill(req: Request, res: Response) {
    try {
      return this.sendSuccess(
        res,
        await this.support.fulfill(toInteger(req.params.id) || 0, this.admin(req), req.body || {}),
      );
    } catch (error) {
      return this.handleError(res, error, 'Verified support fulfillment');
    }
  }
}
