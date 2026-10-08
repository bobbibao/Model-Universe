import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import PartnerListingService from '../../core/server/services/PartnerListingService';
import FileStorageService from '../../core/server/services/FileStorageService';
import HttpError from '../../shared/server/utils/HttpError';

@Controller('/partners/listings')
export default class PartnerListingController extends ApiBaseController {
  private service = new PartnerListingService();
  private user(req: Request) {
    if (!req.user) throw HttpError.unauthorized();
    return req.user.id;
  }
  @Get('/')
  async list(req: Request, res: Response) {
    try {
      return res.json(await this.service.list(this.user(req), Number(req.query.offset || 0)));
    } catch (error) {
      return this.handleError(res, error, 'Owned seller listings');
    }
  }
  @Get('/:id')
  async detail(req: Request, res: Response) {
    try {
      return res.json(await this.service.detail(Number(req.params.id), this.user(req)));
    } catch (error) {
      return this.handleError(res, error, 'Owned seller listing details');
    }
  }
  @Post('/photos')
  async upload(req: Request, res: Response) {
    try {
      const userId = this.user(req);
      await this.service.eligiblePartner(userId);
      return this.sendSuccess(res, await new FileStorageService().savePartnerImages(req, res, userId));
    } catch (error) {
      return this.handleError(res, error, 'Consented seller merchandise photos');
    }
  }
  @Post('/')
  async create(req: Request, res: Response) {
    try {
      return this.sendSuccess(res, await this.service.create(this.user(req), req.body || {}), undefined, 201);
    } catch (error) {
      return this.handleError(res, error, 'Seller listing draft');
    }
  }
  @Post('/:id/actions')
  async act(req: Request, res: Response) {
    try {
      return this.sendSuccess(res, await this.service.act(Number(req.params.id), this.user(req), req.body || {}));
    } catch (error) {
      return this.handleError(res, error, 'Seller listing change');
    }
  }
}
