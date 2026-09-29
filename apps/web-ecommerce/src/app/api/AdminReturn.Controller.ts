import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Put } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type ReturnService from '../../core/server/services/ReturnService';
import HttpError from '../../shared/server/utils/HttpError';
import { parsePagination, toPaginatedPayload } from '../../shared/server/utils/PaginationUtils';
import { toInteger } from '../../shared/server/utils/ValidationUtils';

@Controller('/admin/returns')
@ControllerModel('ReturnModel')
export default class AdminReturnController extends ApiBaseController {
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
      const message = request.status === 'RECEIVED' ? 'Đã nhận hàng trả.' : 'Đã từ chối yêu cầu trả hàng.';
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
      return this.sendSuccess(res, request, 'Đã nhập lại kho.');
    } catch (error) {
      return this.handleError(res, error, "AdminReturnController's restock");
    }
  }
}
