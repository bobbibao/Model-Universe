import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Put } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type UserService from '../../core/server/services/UserService';
import HttpError from '../../shared/server/utils/HttpError';
import { parsePagination, toPaginatedPayload } from '../../shared/server/utils/PaginationUtils';

@Controller('/admin/users')
@ControllerModel('UserModel')
export default class AdminUserController extends ApiBaseController {
  @Get('/')
  async getUsers(req: Request, res: Response) {
    try {
      const service = await this.requireService<UserService>();
      const { page, perPage, limit, offset } = parsePagination(req);
      const { rows, count } = await service.list({
        q: req.query.q as string | undefined,
        role: req.query.role as string | undefined,
        sortKey: req.query.sort as string | undefined,
        sortDirection: req.query.direction as string | undefined,
        limit,
        offset,
      });
      return res.json(toPaginatedPayload(rows, count, page, perPage));
    } catch (error) {
      return this.handleError(res, error, "AdminUserController's getUsers");
    }
  }

  @Put('/:id/role')
  async updateRole(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      const service = await this.requireService<UserService>();
      const user = await service.updateRole(req.user.id, Number(req.params.id), req.body?.role);
      return this.sendSuccess(res, user, 'Đã cập nhật quyền cho người dùng.');
    } catch (error) {
      return this.handleError(res, error, "AdminUserController's updateRole");
    }
  }

  @Put('/:id/status')
  async updateStatus(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      const service = await this.requireService<UserService>();
      const user = await service.updateStatus(req.user.id, Number(req.params.id), req.body?.isActive);
      return this.sendSuccess(res, user, user.isActive ? 'Đã mở khoá tài khoản.' : 'Đã khoá tài khoản.');
    } catch (error) {
      return this.handleError(res, error, "AdminUserController's updateStatus");
    }
  }
}
