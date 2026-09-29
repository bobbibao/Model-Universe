import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post, Put } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type CiConsoleService from '../../core/server/services/CiConsoleService';
import CiEventService from '../../core/server/services/CiEventService';
import HttpError from '../../shared/server/utils/HttpError';

// CI Console (admin only, via the /admin prefix): proxies the agent service for the signed-in admin.
@Controller('/admin/ci')
@ControllerModel('CiConsoleModel')
export default class AdminCiController extends ApiBaseController {
  private eventService = new CiEventService();

  @Get('/improvements')
  async getImprovements(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      const service = await this.requireService<CiConsoleService>();
      return res.json(await service.listImprovements(req.user, req.query.group as string | undefined));
    } catch (error) {
      return this.handleError(res, error, "AdminCiController's getImprovements");
    }
  }

  @Get('/improvements/:id')
  async getImprovement(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      const service = await this.requireService<CiConsoleService>();
      return res.json(await service.getImprovement(req.user, req.params.id));
    } catch (error) {
      return this.handleError(res, error, "AdminCiController's getImprovement");
    }
  }

  @Post('/improvements/:id/decision')
  async decide(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      const service = await this.requireService<CiConsoleService>();
      const improvement = await service.decide(req.user, req.params.id, req.body || {});
      return this.sendSuccess(res, improvement, 'Đã ghi nhận quyết định.');
    } catch (error) {
      return this.handleError(res, error, "AdminCiController's decide");
    }
  }

  @Post('/runs')
  async runNow(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      const service = await this.requireService<CiConsoleService>();
      const report = await service.runNow(req.user);
      return this.sendSuccess(
        res,
        report,
        `Đã chạy phát hiện: ${report.detected} vấn đề mới, ${report.advanced} đề xuất được cập nhật.`,
      );
    } catch (error) {
      return this.handleError(res, error, "AdminCiController's runNow");
    }
  }

  // Notifications addressed to the signed-in admin (the agent's recipient id is the web user id).
  @Get('/notifications')
  async getNotifications(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      return res.json(await this.eventService.listNotifications(String(req.user.id)));
    } catch (error) {
      return this.handleError(res, error, "AdminCiController's getNotifications");
    }
  }

  @Put('/notifications/read')
  async markNotificationsRead(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      await this.eventService.markAllRead(String(req.user.id));
      return this.sendSuccess(res);
    } catch (error) {
      return this.handleError(res, error, "AdminCiController's markNotificationsRead");
    }
  }
}
