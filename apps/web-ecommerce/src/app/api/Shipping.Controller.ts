import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import FulfillmentService from '../../core/server/services/FulfillmentService';
import ShippingService from '../../core/server/services/ShippingService';
import CartService, { normalizeCartItems } from '../../core/server/services/CartService';
import * as Ghn from '../../core/server/services/delivery/GhnClient';
import { reverseGeocode, searchAddress } from '../../core/server/services/delivery/Geocoder';
import { asTrimmedString } from '../../shared/server/utils/ValidationUtils';

// Public delivery data for checkout (GHN master data, address suggestions, the fee quote) and the GHN status callback
// (authenticated by its configured custom header, no session).
@Controller('/shipping')
export default class ShippingController extends ApiBaseController {
  private fulfillment = new FulfillmentService();
  private shipping = new ShippingService();

  @Get('/config')
  async config(_req: Request, res: Response) {
    try {
      return res.json(this.shipping.config());
    } catch (error) {
      return this.handleError(res, error, 'Shipping configuration');
    }
  }

  @Get('/provinces')
  async provinces(_req: Request, res: Response) {
    try {
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.json(await Ghn.provinces());
    } catch (error) {
      return this.handleError(res, error, 'GHN provinces');
    }
  }

  @Get('/wards')
  async wards(req: Request, res: Response) {
    try {
      const provinceId = Number(req.query.provinceId);
      if (!Number.isSafeInteger(provinceId) || provinceId < 1) return res.json([]);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.json(await Ghn.wards(provinceId));
    } catch (error) {
      return this.handleError(res, error, 'GHN wards');
    }
  }

  @Get('/geocode')
  async geocode(req: Request, res: Response) {
    try {
      return res.json(await searchAddress(asTrimmedString(req.query.q), asTrimmedString(req.query.province)));
    } catch (error) {
      return this.handleError(res, error, 'Address suggestions');
    }
  }

  @Get('/reverse')
  async reverse(req: Request, res: Response) {
    try {
      return res.json(await reverseGeocode(Number(req.query.lat), Number(req.query.lng)));
    } catch (error) {
      return this.handleError(res, error, 'Reverse geocoding');
    }
  }

  // The GHN fee and estimate for the bag at this address (the order recomputes it on placement).
  @Post('/quote')
  async quote(req: Request, res: Response) {
    try {
      const items = normalizeCartItems(req.body?.items);
      const address = await this.shipping.validateAddress(req.body?.address);
      const { lines } = await new CartService().resolveLines(items);
      const merchandise = lines.reduce((sum, line) => sum + line.lineTotal, 0);
      const quote = await this.shipping.quote({
        units: items.reduce((sum, item) => sum + item.quantity, 0),
        address,
        recipientName: asTrimmedString(req.body?.recipientName),
        phone: asTrimmedString(req.body?.phone),
        codAmountVnd: merchandise,
        orderValueVnd: merchandise,
      });
      return res.json({ feeVnd: quote.feeVnd, expectedDeliveryTime: quote.expectedDeliveryTime, source: quote.source });
    } catch (error) {
      return this.handleError(res, error, 'GHN fee quote');
    }
  }

  @Post('/ghn/webhook')
  async ghnWebhook(req: Request, res: Response) {
    try {
      return res.json(await this.fulfillment.ghnWebhook(req.headers['x-webhook-token'], req.body || {}));
    } catch (error) {
      return this.handleError(res, error, 'GHN webhook');
    }
  }
}
