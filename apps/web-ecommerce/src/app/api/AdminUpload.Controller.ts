import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type FileStorageService from '../../core/server/services/FileStorageService';

@Controller('/admin/uploads')
@ControllerModel('FileStorageModel')
export default class AdminUploadController extends ApiBaseController {
  // multipart/form-data with one or more `files` fields.
  @Post('/images')
  async uploadImages(req: Request, res: Response) {
    try {
      const service = await this.requireService<FileStorageService>();
      const urls = await service.saveProductImages(req, res);
      return this.sendSuccess(res, { urls }, undefined, 201);
    } catch (error) {
      return this.handleError(res, error, "AdminUploadController's uploadImages");
    }
  }
}
