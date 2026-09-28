import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Put } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type UserService from '../../core/server/services/UserService';
import HttpError from '../../shared/server/utils/HttpError';

@Controller('/users')
@ControllerModel('UserModel')
export default class UserController extends ApiBaseController {
  @Put('/me')
  async updateMe(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      const service = await this.requireService<UserService>();
      const user = await service.updateProfile(req.user.id, req.body || {});
      return this.sendSuccess(res, user, 'Cập nhật thông tin thành công.');
    } catch (error) {
      return this.handleError(res, error, "UserController's updateMe");
    }
  }
}
