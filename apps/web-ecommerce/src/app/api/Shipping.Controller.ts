import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import FulfillmentService from '../../core/server/services/FulfillmentService';
import ShippingService from '../../core/server/services/ShippingService';
import { planItems } from '../../core/server/services/PackagePlanService';
import CartService, { normalizeCartItems } from '../../core/server/services/CartService';
import * as SuperAi from '../../core/server/services/delivery/SuperAiClient';
import { resolvePlace, reverseGeocode, searchAddress } from '../../core/server/services/delivery/Geocoder';
import { asTrimmedString } from '../../shared/server/utils/ValidationUtils';

const AREA_CODE = /^[0-9A-Za-z]{1,16}$/;

// Public delivery data for checkout (SuperAI areas, address suggestions, the carrier quote) and the SuperAI status
// callback (authenticated by the secret token in its URL, no session).
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
      return res.json(await SuperAi.provinces());
    } catch (error) {
      return this.handleError(res, error, 'SuperAI provinces');
    }
  }

  @Get('/districts')
  async districts(req: Request, res: Response) {
    try {
      const province = asTrimmedString(req.query.province);
      if (!AREA_CODE.test(province)) return res.json([]);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.json(await SuperAi.districts(province));
    } catch (error) {
      return this.handleError(res, error, 'SuperAI districts');
    }
  }

  @Get('/communes')
  async communes(req: Request, res: Response) {
    try {
      const district = asTrimmedString(req.query.district);
      if (!AREA_CODE.test(district)) return res.json([]);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.json(await SuperAi.communes(district));
    } catch (error) {
      return this.handleError(res, error, 'SuperAI communes');
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

  @Get('/place')
  async place(req: Request, res: Response) {
    try {
      return res.json(await resolvePlace(asTrimmedString(req.query.id)));
    } catch (error) {
      return this.handleError(res, error, 'Place lookup');
    }
  }

  // Where customers meet the shop to see and collect an order in person.
  @Get('/showroom')
  async showroom(_req: Request, res: Response) {
    try {
      return res.json(await this.shipping.showroom());
    } catch (error) {
      return this.handleError(res, error, 'Shop address');
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

  // Every carrier's price for the bag at this address and the cheapest one (the order uses the same quote).
  @Post('/quote')
  async quote(req: Request, res: Response) {
    try {
      const items = normalizeCartItems(req.body?.items);
      const address = await this.shipping.validateAddress(req.body?.address);
      const { lines, products } = await new CartService().resolveLines(items);
      const quote = await this.shipping.quote({ items: planItems(lines, products), address });
      return res.json({
        feeVnd: quote.feeVnd,
        carrier: quote.carrier,
        options: quote.options,
        source: quote.source,
        // What the customer needs to know of the packing: how many parcels.
        parcels: quote.plan?.parcels.length ?? 1,
      });
    } catch (error) {
      return this.handleError(res, error, 'Carrier quote');
    }
  }

  @Post('/superai/webhook')
  async superAiWebhook(req: Request, res: Response) {
    try {
      return res.json(await this.fulfillment.superAiWebhook(req.query.token, req.body || {}));
    } catch (error) {
      return this.handleError(res, error, 'SuperAI webhook');
    }
  }
}
