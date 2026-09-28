import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type CategoryService from '../../core/server/services/CategoryService';

@Controller('/categories')
@ControllerModel('CategoryModel')
export default class CategoryController extends ApiBaseController {
  @Get('/')
  async getCategories(_: Request, res: Response) {
    try {
      const service = await this.requireService<CategoryService>();
      return res.json(await service.listPublic());
    } catch (error) {
      return this.handleError(res, error, "CategoryController's getCategories");
    }
  }
}
