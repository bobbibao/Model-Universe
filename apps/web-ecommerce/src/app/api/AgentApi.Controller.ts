import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type AgentActionService from '../../core/server/services/AgentActionService';
import type { AgentEndpoint } from '../../core/server/services/AgentActionService';
import { sendAgentError } from '../../shared/server/utils/AgentApiUtils';

// Agent API: Act-phase writes from the shop agent (packages/contracts/openapi/web-agent-api.yaml).
// AgentServiceAuthMiddleware checks the service token before these handlers run. Responses are flat JSON
// (`{ ref, detail }`), not the ApiResponse envelope, because the agent's HTTP adapter reads them directly.
@Controller('/agent/v1')
@ControllerModel('AgentActionModel')
export default class AgentApiController extends ApiBaseController {
  private async handle(req: Request, res: Response, endpoint: AgentEndpoint) {
    try {
      const service = await this.requireService<AgentActionService>();
      return res.status(200).json(await service.execute(endpoint, req.header('Idempotency-Key'), req.body));
    } catch (error) {
      return sendAgentError(res, error, `AgentApiController's ${endpoint}`);
    }
  }

  @Post('/inventory/adjustments')
  async adjustInventory(req: Request, res: Response) {
    return this.handle(req, res, 'inventory/adjustments');
  }

  @Post('/pricing/discounts')
  async applyDiscount(req: Request, res: Response) {
    return this.handle(req, res, 'pricing/discounts');
  }

  @Post('/tasks')
  async createTask(req: Request, res: Response) {
    return this.handle(req, res, 'tasks');
  }

  @Post('/channels/switch')
  async switchChannel(req: Request, res: Response) {
    return this.handle(req, res, 'channels/switch');
  }

  @Post('/sop/checklists')
  async updateSopChecklist(req: Request, res: Response) {
    return this.handle(req, res, 'sop/checklists');
  }

  @Post('/actions/:key/revert')
  async revert(req: Request, res: Response) {
    try {
      const service = await this.requireService<AgentActionService>();
      return res.status(200).json(await service.revert(req.header('Idempotency-Key'), req.params.key));
    } catch (error) {
      return sendAgentError(res, error, "AgentApiController's revert");
    }
  }
}
