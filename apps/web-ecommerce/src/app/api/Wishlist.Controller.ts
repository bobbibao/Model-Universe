import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Delete, Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type WishlistService from '../../core/server/services/WishlistService';
import HttpError from '../../shared/server/utils/HttpError';
import { toInteger } from '../../shared/server/utils/ValidationUtils';

@Controller('/wishlist')
@ControllerModel('WishlistModel')
export default class WishlistController extends ApiBaseController {
  @Get('/')
  async getWishlist(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      const service = await this.requireService<WishlistService>();
      return res.json(await service.list(req.user.id));
    } catch (error) {
      return this.handleError(res, error, "WishlistController's getWishlist");
    }
  }

  @Post('/')
  async addItem(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      const service = await this.requireService<WishlistService>();
      const item = await service.add(req.user.id, req.body || {});
      return this.sendSuccess(res, item, 'Đã thêm vào danh sách yêu thích.', 201);
    } catch (error) {
      return this.handleError(res, error, "WishlistController's addItem");
    }
  }

  @Delete('/:id')
  async removeItem(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      const service = await this.requireService<WishlistService>();
      await service.remove(req.user.id, toInteger(req.params.id) || 0);
      return this.sendSuccess(res, undefined, 'Đã xoá khỏi danh sách yêu thích.');
    } catch (error) {
      return this.handleError(res, error, "WishlistController's removeItem");
    }
  }
}
