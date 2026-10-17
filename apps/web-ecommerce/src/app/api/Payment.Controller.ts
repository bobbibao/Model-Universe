import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import PaymentGatewayService from '../../core/server/services/PaymentGatewayService';

// payOS payment webhook: no session; the payload signature is verified with the checksum key (payOS SDK).
@Controller('/payments')
export default class PaymentController extends ApiBaseController {
  private service = new PaymentGatewayService();
  @Post('/payos/webhook')
  async payos(req: Request, res: Response) {
    try {
      return res.json(await this.service.webhook(req.body || {}));
    } catch (error) {
      return this.handleError(res, error, 'payOS webhook');
    }
  }
}
