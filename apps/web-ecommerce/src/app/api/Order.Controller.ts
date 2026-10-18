import { apiMessage } from '../../shared/server/utils/ApiLocale';
import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post, Put } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type OrderService from '../../core/server/services/OrderService';
import HttpError from '../../shared/server/utils/HttpError';
import FulfillmentService from '../../core/server/services/FulfillmentService';
import PaymentGatewayService, { paymentsEnabled } from '../../core/server/services/PaymentGatewayService';
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
      // With online payment the order is created only after the QR payment (POST /checkout/sessions).
      if (paymentsEnabled()) throw HttpError.conflict('Pay online to place this order.', 'CHECKOUT_SESSION_REQUIRED');
      const service = await this.requireService<OrderService>();
      const attribution = parseAttributionCookie(req.cookies?.[ATTRIBUTION_COOKIE]);
      const consent = parseConsentCookie(req.cookies?.[CONSENT_COOKIE]);
      const order = await service.placeOrder(req.user.id, req.body || {}, attribution, consent);
      return this.sendSuccess(res, order, apiMessage(req, 'toastOrdered'), 201);
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

  // The order's open payment QR, if any (viewing an order never creates a payment).
  @Get('/:id/payment')
  async payment(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      return res.json(await new PaymentGatewayService().openLink(req.user.id, toInteger(req.params.id) || 0));
    } catch (error) {
      return this.handleError(res, error, 'Online payment');
    }
  }

  // The payment QR (payOS) for the order's deposit or full amount: the open one again, or a new one.
  @Post('/:id/payment-link')
  async paymentLink(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      const locale = req.body?.locale === 'en' ? 'en' : 'vi';
      return res.json(await new PaymentGatewayService().createLink(req.user.id, toInteger(req.params.id) || 0, locale));
    } catch (error) {
      return this.handleError(res, error, 'Online payment link');
    }
  }

  // Asks payOS whether the payment arrived (the return page); the webhook records it too.
  @Get('/:id/payment-status')
  async paymentStatus(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      return res.json(await new PaymentGatewayService().sync(toInteger(req.params.id) || 0, req.user.id));
    } catch (error) {
      return this.handleError(res, error, 'Online payment status');
    }
  }

  // The order with its latest carrier tracking (pulled from SuperAI at most once a minute).
  @Get('/:id/tracking')
  async tracking(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      return res.json(await new FulfillmentService().refreshTracking(toInteger(req.params.id) || 0, req.user.id));
    } catch (error) {
      return this.handleError(res, error, 'Order tracking');
    }
  }

  // The customer proposes another handover place or time; it applies only after the shop confirms it.
  @Post('/:id/meeting-change')
  async meetingChange(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      return this.sendSuccess(
        res,
        await new FulfillmentService().requestMeetingChange(req.user.id, toInteger(req.params.id) || 0, req.body || {}),
      );
    } catch (error) {
      return this.handleError(res, error, 'Handover change request');
    }
  }

  @Put('/:id/cancel')
  async cancelMyOrder(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      const service = await this.requireService<OrderService>();
      const order = await service.cancelForUser(req.user.id, toInteger(req.params.id) || 0, req.body || {});
      return this.sendSuccess(res, order, apiMessage(req, 'toastCancelled'));
    } catch (error) {
      return this.handleError(res, error, "OrderController's cancelMyOrder");
    }
  }
}
