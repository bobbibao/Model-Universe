import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Delete, Get, Post, Put } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type SupplierService from '../../core/server/services/SupplierService';
import { parsePagination, toPaginatedPayload } from '../../shared/server/utils/PaginationUtils';
import { toInteger } from '../../shared/server/utils/ValidationUtils';

@Controller('/admin/suppliers')
@ControllerModel('SupplierModel')
export default class AdminSupplierController extends ApiBaseController {
  @Get('/')
  async getSuppliers(req: Request, res: Response) {
    try {
      const service = await this.requireService<SupplierService>();
      const { page, perPage, limit, offset } = parsePagination(req);
      const { rows, count } = await service.list({
        q: req.query.q as string | undefined,
        status: req.query.status as string | undefined,
        sortKey: req.query.sort as string | undefined,
        sortDirection: req.query.direction as string | undefined,
        limit,
        offset,
      });
      return res.json(toPaginatedPayload(rows, count, page, perPage));
    } catch (error) {
      return this.handleError(res, error, "AdminSupplierController's getSuppliers");
    }
  }

  // Declared before any '/:id' route. Active suppliers for select inputs.
  @Get('/options')
  async getSupplierOptions(_: Request, res: Response) {
    try {
      const service = await this.requireService<SupplierService>();
      return res.json(await service.options());
    } catch (error) {
      return this.handleError(res, error, "AdminSupplierController's getSupplierOptions");
    }
  }

  @Post('/')
  async createSupplier(req: Request, res: Response) {
    try {
      const service = await this.requireService<SupplierService>();
      const supplier = await service.create(req.body || {});
      return this.sendSuccess(res, supplier, 'Thêm nhà cung cấp thành công.', 201);
    } catch (error) {
      return this.handleError(res, error, "AdminSupplierController's createSupplier");
    }
  }

  @Put('/:id')
  async updateSupplier(req: Request, res: Response) {
    try {
      const service = await this.requireService<SupplierService>();
      const supplier = await service.update(toInteger(req.params.id) || 0, req.body || {});
      return this.sendSuccess(res, supplier, 'Cập nhật nhà cung cấp thành công.');
    } catch (error) {
      return this.handleError(res, error, "AdminSupplierController's updateSupplier");
    }
  }

  @Delete('/:id')
  async deleteSupplier(req: Request, res: Response) {
    try {
      const service = await this.requireService<SupplierService>();
      await service.remove(toInteger(req.params.id) || 0);
      return this.sendSuccess(res, undefined, 'Đã xoá nhà cung cấp.');
    } catch (error) {
      return this.handleError(res, error, "AdminSupplierController's deleteSupplier");
    }
  }
}
