import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type AgentActionService from '../../core/server/services/AgentActionService';
import { parsePagination, toPaginatedPayload } from '../../shared/server/utils/PaginationUtils';

// The audit trail of the agent's writes (/admin/agent/audit): approval, grant, thread, trace and result of each.
@Controller('/admin/agent/audit')
@ControllerModel('AgentActionModel')
export default class AdminAgentAuditController extends ApiBaseController {
  @Get('/')
  async getAudit(req: Request, res: Response) {
    try {
      const service = await this.requireService<AgentActionService>();
      const { page, perPage, limit, offset } = parsePagination(req);
      const { rows, count } = await service.listAudit({
        writeClass: req.query.writeClass as string | undefined,
        q: req.query.q as string | undefined,
        limit,
        offset,
      });
      return res.json(toPaginatedPayload(rows, count, page, perPage));
    } catch (error) {
      return this.handleError(res, error, "AdminAgentAuditController's getAudit");
    }
  }
}
