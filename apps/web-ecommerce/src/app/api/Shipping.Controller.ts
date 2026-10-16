import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import FulfillmentService from '../../core/server/services/FulfillmentService';

// Carrier callbacks: no session; every request must carry a valid HMAC signature (SpxCarrier.verifyWebhookSignature).
@Controller('/shipping')
export default class ShippingController extends ApiBaseController {
  private service = new FulfillmentService();
  @Post('/spx/webhook')
  async spx(req: Request, res: Response) {
    try {
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      return res.json(await this.service.webhook(rawBody, req.headers['x-spx-signature'], req.body || {}));
    } catch (error) {
      return this.handleError(res, error, 'SPX webhook');
    }
  }
}
