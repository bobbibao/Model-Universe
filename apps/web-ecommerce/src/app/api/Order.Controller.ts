import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post, Put } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type OrderService from '../../core/server/services/OrderService';
import HttpError from '../../shared/server/utils/HttpError';
import { parsePagination, toPaginatedPayload } from '../../shared/server/utils/PaginationUtils';
import { toInteger } from '../../shared/server/utils/ValidationUtils';
import { ATTRIBUTION_COOKIE, parseAttributionCookie } from '../../shared/server/utils/AttributionUtils';
import { CONSENT_COOKIE, parseConsentCookie } from '../../shared/server/utils/ConsentUtils';

const DEFAULT_PAGE_SIZE = 5;

// Orders of the signed-in customer.
@Controller('/orders')
@ControllerModel('OrderModel')
export default class OrderController extends ApiBaseController {
  @Post('/')
  async placeOrder(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      const service = await this.requireService<OrderService>();
      const attribution = parseAttributionCookie(req.cookies?.[ATTRIBUTION_COOKIE]);
      const consent = parseConsentCookie(req.cookies?.[CONSENT_COOKIE]);
      const order = await service.placeOrder(req.user.id, req.body || {}, attribution, consent);
      return this.sendSuccess(res, order, 'Đặt hàng thành công.', 201);
    } catch (error) {
      return this.handleError(res, error, "OrderController's placeOrder");
    }
  }

  @Get('/')
  async getMyOrders(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      const service = await this.requireService<OrderService>();
      const { page, perPage, limit, offset } = parsePagination(req, DEFAULT_PAGE_SIZE);
      const { rows, count } = await service.listForUser(req.user.id, limit, offset);
      return res.json(toPaginatedPayload(rows, count, page, perPage));
    } catch (error) {
      return this.handleError(res, error, "OrderController's getMyOrders");
    }
  }

  @Get('/:id')
  async getMyOrder(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      const service = await this.requireService<OrderService>();
      return res.json(await service.getForUser(req.user.id, toInteger(req.params.id) || 0));
    } catch (error) {
      return this.handleError(res, error, "OrderController's getMyOrder");
    }
  }

  @Put('/:id/cancel')
  async cancelMyOrder(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      const service = await this.requireService<OrderService>();
      const order = await service.cancelForUser(req.user.id, toInteger(req.params.id) || 0);
      return this.sendSuccess(res, order, 'Đã huỷ đơn hàng.');
    } catch (error) {
      return this.handleError(res, error, "OrderController's cancelMyOrder");
    }
  }
}
