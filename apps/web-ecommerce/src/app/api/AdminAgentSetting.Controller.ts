import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Put } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type AgentSettingService from '../../core/server/services/AgentSettingService';

// The agent's business controls (/admin/agent/settings): goal, caps, autonomy per capability, kill switch.
@Controller('/admin/agent/settings')
@ControllerModel('AgentSettingModel')
export default class AdminAgentSettingController extends ApiBaseController {
  @Get('/')
  async getSettings(_req: Request, res: Response) {
    try {
      const service = await this.requireService<AgentSettingService>();
      const [settings, targets, audit] = await Promise.all([
        service.getAll(),
        service.getTargets(),
        service.listAudit(),
      ]);
      return this.sendSuccess(res, { settings, targets, audit });
    } catch (error) {
      return this.handleError(res, error, "AdminAgentSettingController's getSettings");
    }
  }

  @Put('/:key')
  async updateSetting(req: Request, res: Response) {
    try {
      const service = await this.requireService<AgentSettingService>();
      const entry = await service.update(req.params.key, req.body || {}, req.user?.id as number);
      return this.sendSuccess(res, entry, 'Đã lưu cài đặt.');
    } catch (error) {
      return this.handleError(res, error, "AdminAgentSettingController's updateSetting");
    }
  }
}
