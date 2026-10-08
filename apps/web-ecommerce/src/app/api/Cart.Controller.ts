import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type CartService from '../../core/server/services/CartService';
import HttpError from '../../shared/server/utils/HttpError';

@Controller('/cart')
@ControllerModel('CartModel')
export default class CartController extends ApiBaseController {
  // Public: the cart itself lives in the browser; this prices it from the database.
  @Post('/quote')
  async quote(req: Request, res: Response) {
    try {
      const service = await this.requireService<CartService>();
      if ((req.body?.couponCode || req.body?.useMemberDiscount) && !req.user) throw HttpError.unauthorized();
      return res.json(await service.quote(req.body?.items, req.body?.couponCode, req.user?.id, req.body?.useMemberDiscount === true));
    } catch (error) {
      return this.handleError(res, error, "CartController's quote");
    }
  }
}
