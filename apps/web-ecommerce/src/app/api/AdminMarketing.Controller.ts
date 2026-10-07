import { Controller } from '../../shared/server/decorators/controller.decorator';
import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../shared/server/types/express';
import HttpError from '../../shared/server/utils/HttpError';
import AdminMarketingService from '../../core/server/services/AdminMarketingService';
import FileStorageService from '../../core/server/services/FileStorageService';
import MarketingAssetModel from '../../core/server/database/client/models/MarketingAsset.Model';
import ApiBaseController from './ApiBase.Controller';

@Controller('/admin/marketing')
@ControllerModel('AdminMarketingModel')
export default class AdminMarketingController extends ApiBaseController {
  @Post('/assets/upload')
  async upload(req: Request, res: Response) {
    const storage = new FileStorageService();
    let url: string | undefined;
    try {
      const user = this.user(req);
      const media = await storage.saveMarketingMedia(req, res);
      url = media.url;
      const asset = await MarketingAssetModel.create({ ...media, uploadedBy: user.id });
      return this.sendSuccess(res, asset, 'Đã tải tư liệu marketing.', 201);
    } catch (error) {
      if (url) await storage.removeFiles([url]);
      return this.handleError(res, error, 'Upload marketing media');
    }
  }

  private user(req: Request): AuthUser {
    if (!req.user) throw HttpError.unauthorized();
    if (req.user.role !== 'ADMIN') throw HttpError.forbidden();
    return req.user;
  }
  private id(req: Request): number {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw HttpError.badRequest('Mã bản nháp không hợp lệ.');
    return id;
  }
  @Get('/options')
  async options(req: Request, res: Response) {
    try {
      this.user(req);
      return this.sendSuccess(res, await new AdminMarketingService().options());
    } catch (error) {
      return this.handleError(res, error, 'Marketing options');
    }
  }
  @Get('/drafts')
  async drafts(req: Request, res: Response) {
    try {
      this.user(req);
      return this.sendSuccess(res, await new AdminMarketingService().list());
    } catch (error) {
      return this.handleError(res, error, 'Marketing drafts');
    }
  }
  @Post('/drafts')
  async create(req: Request, res: Response) {
    try {
      return this.sendSuccess(
        res,
        await new AdminMarketingService().save(this.user(req), req.body),
        'Đã lưu bản nháp.',
        201,
      );
    } catch (error) {
      return this.handleError(res, error, 'Create marketing draft');
    }
  }
  @Post('/drafts/:id/save')
  async save(req: Request, res: Response) {
    try {
      return this.sendSuccess(
        res,
        await new AdminMarketingService().save(this.user(req), req.body, this.id(req)),
        'Đã lưu bản nháp.',
      );
    } catch (error) {
      return this.handleError(res, error, 'Save marketing draft');
    }
  }
  @Post('/suggest')
  async suggest(req: Request, res: Response) {
    try {
      return this.sendSuccess(res, await new AdminMarketingService().suggest(this.user(req), req.body));
    } catch (error) {
      return this.handleError(res, error, 'Suggest marketing copy');
    }
  }
  @Post('/drafts/:id/publish')
  async publish(req: Request, res: Response) {
    try {
      return this.sendSuccess(
        res,
        await new AdminMarketingService().publish(this.user(req), this.id(req)),
        'Đã gửi chiến dịch.',
      );
    } catch (error) {
      return this.handleError(res, error, 'Publish marketing draft');
    }
  }
  @Post('/drafts/:id/:action')
  async control(req: Request, res: Response) {
    try {
      const action = req.params.action;
      if (action !== 'activate' && action !== 'pause' && action !== 'end')
        throw HttpError.badRequest('Thao tác không hợp lệ.');
      await new AdminMarketingService().control(this.user(req), this.id(req), action);
      return this.sendSuccess(res, null, 'Đã cập nhật chiến dịch.');
    } catch (error) {
      return this.handleError(res, error, 'Control marketing campaign');
    }
  }
}
