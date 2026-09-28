import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Put } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type OrderService from '../../core/server/services/OrderService';
import { parsePagination, toPaginatedPayload } from '../../shared/server/utils/PaginationUtils';
import { toInteger } from '../../shared/server/utils/ValidationUtils';

@Controller('/admin/orders')
@ControllerModel('OrderModel')
export default class AdminOrderController extends ApiBaseController {
  @Get('/')
  async getOrders(req: Request, res: Response) {
    try {
      const service = await this.requireService<OrderService>();
      const { page, perPage, limit, offset } = parsePagination(req);
      const { rows, count } = await service.listAdmin({
        status: req.query.status as string | undefined,
        q: req.query.q as string | undefined,
        sortKey: req.query.sort as string | undefined,
        sortDirection: req.query.direction as string | undefined,
        limit,
        offset,
      });
      return res.json(toPaginatedPayload(rows, count, page, perPage));
    } catch (error) {
      return this.handleError(res, error, "AdminOrderController's getOrders");
    }
  }

  @Get('/:id')
  async getOrder(req: Request, res: Response) {
    try {
      const service = await this.requireService<OrderService>();
      return res.json(await service.getAdmin(toInteger(req.params.id) || 0));
    } catch (error) {
      return this.handleError(res, error, "AdminOrderController's getOrder");
    }
  }

  @Put('/:id/status')
  async updateStatus(req: Request, res: Response) {
    try {
      const service = await this.requireService<OrderService>();
      const order = await service.updateStatus(toInteger(req.params.id) || 0, req.body?.status);
      return this.sendSuccess(res, order, 'Thay đổi trạng thái đơn hàng thành công.');
    } catch (error) {
      return this.handleError(res, error, "AdminOrderController's updateStatus");
    }
  }
}
