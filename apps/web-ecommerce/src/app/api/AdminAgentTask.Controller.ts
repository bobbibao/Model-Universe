import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Put } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type AgentTaskService from '../../core/server/services/AgentTaskService';
import { parsePagination, toPaginatedPayload } from '../../shared/server/utils/PaginationUtils';
import { toInteger } from '../../shared/server/utils/ValidationUtils';

@Controller('/admin/agent/tasks')
@ControllerModel('AgentTaskModel')
export default class AdminAgentTaskController extends ApiBaseController {
  @Get('/')
  async getTasks(req: Request, res: Response) {
    try {
      const service = await this.requireService<AgentTaskService>();
      const { page, perPage, limit, offset } = parsePagination(req);
      const { rows, count } = await service.list(req.query.status as string | undefined, limit, offset);
      return res.json(toPaginatedPayload(rows, count, page, perPage));
    } catch (error) {
      return this.handleError(res, error, "AdminAgentTaskController's getTasks");
    }
  }

  @Put('/:id/status')
  async updateStatus(req: Request, res: Response) {
    try {
      const service = await this.requireService<AgentTaskService>();
      const task = await service.updateStatus(toInteger(req.params.id) || 0, req.body?.status);
      return this.sendSuccess(res, task, 'Đã cập nhật công việc.');
    } catch (error) {
      return this.handleError(res, error, "AdminAgentTaskController's updateStatus");
    }
  }
}
