import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import CheckoutService from '../../core/server/services/CheckoutService';
import HttpError from '../../shared/server/utils/HttpError';
import { toInteger } from '../../shared/server/utils/ValidationUtils';
import { ATTRIBUTION_COOKIE, parseAttributionCookie } from '../../shared/server/utils/AttributionUtils';
import { CONSENT_COOKIE, parseConsentCookie } from '../../shared/server/utils/ConsentUtils';

// Online checkout of the signed-in customer: a QR payment session; the order is created once payOS confirms it.
@Controller('/checkout')
export default class CheckoutController extends ApiBaseController {
  private service = new CheckoutService();

  private user(req: Request) {
    if (!req.user?.id) throw HttpError.unauthorized();
    return req.user.id;
  }
  private locale(req: Request) {
    return req.body?.locale === 'en' ? 'en' : 'vi';
  }

  @Post('/sessions')
  async create(req: Request, res: Response) {
    try {
      const session = await this.service.create(
        this.user(req),
        req.body || {},
        this.locale(req),
        parseAttributionCookie(req.cookies?.[ATTRIBUTION_COOKIE]),
        parseConsentCookie(req.cookies?.[CONSENT_COOKIE]),
      );
      return res.status(201).json(session);
    } catch (error) {
      return this.handleError(res, error, 'Checkout session');
    }
  }

  @Get('/sessions')
  async open(req: Request, res: Response) {
    try {
      return res.json(await this.service.listOpen(this.user(req)));
    } catch (error) {
      return this.handleError(res, error, 'Open checkouts');
    }
  }

  @Get('/sessions/:id')
  async status(req: Request, res: Response) {
    try {
      return res.json(await this.service.get(this.user(req), toInteger(req.params.id) || 0));
    } catch (error) {
      return this.handleError(res, error, 'Checkout session status');
    }
  }

  @Post('/sessions/:id/plan')
  async changePlan(req: Request, res: Response) {
    try {
      return res.json(
        await this.service.changePlan(this.user(req), toInteger(req.params.id) || 0, req.body || {}, this.locale(req)),
      );
    } catch (error) {
      return this.handleError(res, error, 'Checkout payment change');
    }
  }

  @Post('/sessions/:id/cancel')
  async cancel(req: Request, res: Response) {
    try {
      return res.json(await this.service.cancel(this.user(req), toInteger(req.params.id) || 0));
    } catch (error) {
      return this.handleError(res, error, 'Cancel checkout');
    }
  }
}
