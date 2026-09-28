import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type StockImportService from '../../core/server/services/StockImportService';
import HttpError from '../../shared/server/utils/HttpError';
import { parsePagination, toPaginatedPayload } from '../../shared/server/utils/PaginationUtils';
import { toInteger } from '../../shared/server/utils/ValidationUtils';

@Controller('/admin/stock-imports')
@ControllerModel('StockImportModel')
export default class AdminStockImportController extends ApiBaseController {
  @Get('/')
  async getStockImports(req: Request, res: Response) {
    try {
      const service = await this.requireService<StockImportService>();
      const { page, perPage, limit, offset } = parsePagination(req);
      const { rows, count } = await service.list(limit, offset, toInteger(req.query.supplierId));
      return res.json(toPaginatedPayload(rows, count, page, perPage));
    } catch (error) {
      return this.handleError(res, error, "AdminStockImportController's getStockImports");
    }
  }

  @Get('/:id')
  async getStockImport(req: Request, res: Response) {
    try {
      const service = await this.requireService<StockImportService>();
      return res.json(await service.get(toInteger(req.params.id) || 0));
    } catch (error) {
      return this.handleError(res, error, "AdminStockImportController's getStockImport");
    }
  }

  @Post('/')
  async createStockImport(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      const service = await this.requireService<StockImportService>();
      const stockImport = await service.create(req.user.id, req.body || {});
      return this.sendSuccess(res, stockImport, 'Nhập kho thành công.', 201);
    } catch (error) {
      return this.handleError(res, error, "AdminStockImportController's createStockImport");
    }
  }
}
