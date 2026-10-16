import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Put, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type OrderService from '../../core/server/services/OrderService';
import { parsePagination, toPaginatedPayload } from '../../shared/server/utils/PaginationUtils';
import { toInteger } from '../../shared/server/utils/ValidationUtils';
import { apiMessage } from '../../shared/server/utils/ApiLocale';
import FulfillmentService from '../../core/server/services/FulfillmentService';

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
      const order = await service.updateStatus(toInteger(req.params.id) || 0, req.body?.status, req.user?.id);
      return this.sendSuccess(res, order, apiMessage(req, 'toastStatus'));
    } catch (error) {
      return this.handleError(res, error, "AdminOrderController's updateStatus");
    }
  }

  @Post('/:id/collection')
  async collection(req: Request, res: Response) {
    try {
      const service = await this.requireService<OrderService>();
      return this.sendSuccess(
        res,
        await service.confirmCollection(toInteger(req.params.id) || 0, req.user!.id, req.body || {}),
      );
    } catch (error) {
      return this.handleError(res, error, 'Verified order collection');
    }
  }

  // The customer's verified upfront transfer (deposit or full payment), or its refund after cancellation.
  @Post('/:id/prepayment')
  async prepayment(req: Request, res: Response) {
    try {
      const service = await this.requireService<OrderService>();
      return this.sendSuccess(
        res,
        await service.recordPrepayment(toInteger(req.params.id) || 0, req.user!.id, req.body || {}),
      );
    } catch (error) {
      return this.handleError(res, error, 'Verified order prepayment');
    }
  }

  private fulfillment = new FulfillmentService();

  private async run(res: Response, context: string, action: () => Promise<unknown>) {
    try {
      return this.sendSuccess(res, await action());
    } catch (error) {
      return this.handleError(res, error, context);
    }
  }

  @Post('/:id/meeting/confirm')
  confirmMeeting(req: Request, res: Response) {
    return this.run(res, 'Confirm handover appointment', () =>
      this.fulfillment.confirmMeeting(req.user!.id, toInteger(req.params.id) || 0, req.body || {}),
    );
  }

  @Post('/:id/meeting/not-held')
  meetingNotHeld(req: Request, res: Response) {
    return this.run(res, 'Handover not held', () =>
      this.fulfillment.markMeetingNotHeld(req.user!.id, toInteger(req.params.id) || 0, req.body || {}),
    );
  }

  @Post('/:id/handover')
  handover(req: Request, res: Response) {
    return this.run(res, 'In-person handover', () =>
      this.fulfillment.completeHandover(req.user!.id, toInteger(req.params.id) || 0, req.body || {}),
    );
  }

  @Get('/:id/package')
  async packageSuggestion(req: Request, res: Response) {
    try {
      return res.json(await this.fulfillment.suggestPackage(toInteger(req.params.id) || 0));
    } catch (error) {
      return this.handleError(res, error, 'Package suggestion');
    }
  }

  @Post('/:id/shipments/quote')
  async quote(req: Request, res: Response) {
    try {
      return res.json(await this.fulfillment.quote(toInteger(req.params.id) || 0, req.body || {}));
    } catch (error) {
      return this.handleError(res, error, 'SPX quote');
    }
  }

  @Post('/:id/shipments')
  createShipment(req: Request, res: Response) {
    return this.run(res, 'Create SPX waybill', () =>
      this.fulfillment.createShipment(req.user!.id, toInteger(req.params.id) || 0, req.body || {}),
    );
  }

  @Post('/shipments/:shipmentId/events')
  shipmentEvent(req: Request, res: Response) {
    return this.run(res, 'Shipment status', () =>
      this.fulfillment.staffEvent(req.user!.id, toInteger(req.params.shipmentId) || 0, req.body || {}),
    );
  }

  @Post('/shipments/:shipmentId/cancel')
  cancelShipment(req: Request, res: Response) {
    return this.run(res, 'Cancel waybill', () =>
      this.fulfillment.cancelShipment(req.user!.id, toInteger(req.params.shipmentId) || 0, req.body || {}),
    );
  }
}
