import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Delete, Get, Post, Put } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type CategoryService from '../../core/server/services/CategoryService';
import { toInteger } from '../../shared/server/utils/ValidationUtils';

@Controller('/admin/categories')
@ControllerModel('CategoryModel')
export default class AdminCategoryController extends ApiBaseController {
  @Get('/')
  async getCategories(_: Request, res: Response) {
    try {
      const service = await this.requireService<CategoryService>();
      return res.json(await service.listAdmin());
    } catch (error) {
      return this.handleError(res, error, "AdminCategoryController's getCategories");
    }
  }

  @Post('/')
  async createCategory(req: Request, res: Response) {
    try {
      const service = await this.requireService<CategoryService>();
      const category = await service.create(req.body || {});
      return this.sendSuccess(res, category, 'Thêm danh mục thành công.', 201);
    } catch (error) {
      return this.handleError(res, error, "AdminCategoryController's createCategory");
    }
  }

  @Put('/:id')
  async updateCategory(req: Request, res: Response) {
    try {
      const service = await this.requireService<CategoryService>();
      const category = await service.update(toInteger(req.params.id) || 0, req.body || {});
      return this.sendSuccess(res, category, 'Cập nhật danh mục thành công.');
    } catch (error) {
      return this.handleError(res, error, "AdminCategoryController's updateCategory");
    }
  }

  @Delete('/:id')
  async deleteCategory(req: Request, res: Response) {
    try {
      const service = await this.requireService<CategoryService>();
      await service.remove(toInteger(req.params.id) || 0);
      return this.sendSuccess(res, undefined, 'Đã xoá danh mục.');
    } catch (error) {
      return this.handleError(res, error, "AdminCategoryController's deleteCategory");
    }
  }
}
