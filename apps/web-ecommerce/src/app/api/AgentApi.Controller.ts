import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type AgentActionService from '../../core/server/services/AgentActionService';
import type { AgentEndpoint } from '../../core/server/services/AgentActionService';
import { sendAgentError } from '../../shared/server/utils/AgentApiUtils';

// Agent API: writes from the shop agent (packages/contracts/openapi/web-agent-api.yaml). AgentServiceAuthMiddleware
// checks the service token before these handlers run; AgentActionService decides (grant, kill switch, limits) and
// applies. Responses are flat JSON (`{ ref, detail }`, errors `{ error, code, reason? }`), not the ApiResponse
// envelope, because the agent's HTTP adapter reads them directly.
@Controller('/agent/v1')
@ControllerModel('AgentActionModel')
export default class AgentApiController extends ApiBaseController {
  private async handle(req: Request, res: Response, route: AgentEndpoint) {
    try {
      const service = await this.requireService<AgentActionService>();
      const result = await service.execute({
        route,
        path: req.params.ref ? { ref: req.params.ref } : {},
        idempotencyKey: req.header('Idempotency-Key'),
        body: req.body,
        approval: req.header('X-Agent-Approval'),
        context: req.header('X-Agent-Context'),
        traceparent: req.header('traceparent'),
      });
      return res.status(200).json(result);
    } catch (error) {
      return sendAgentError(res, error, `AgentApiController's ${route}`);
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

  @Post('/promotions/coupons')
  async createCoupon(req: Request, res: Response) {
    return this.handle(req, res, 'promotions/coupons');
  }

  @Post('/promotions/:ref/end')
  async endPromotion(req: Request, res: Response) {
    return this.handle(req, res, 'promotions/{ref}/end');
  }

  @Post('/marketing/campaigns')
  async createCampaign(req: Request, res: Response) {
    return this.handle(req, res, 'marketing/campaigns');
  }

  @Post('/marketing/posts')
  async createPost(req: Request, res: Response) {
    return this.handle(req, res, 'marketing/posts');
  }

  @Post('/marketing/ads')
  async createAd(req: Request, res: Response) {
    return this.handle(req, res, 'marketing/ads');
  }

  @Post('/marketing/ads/:ref/activate')
  async activateAd(req: Request, res: Response) {
    return this.handle(req, res, 'marketing/ads/{ref}/activate');
  }

  @Post('/marketing/ads/:ref/pause')
  async pauseAd(req: Request, res: Response) {
    return this.handle(req, res, 'marketing/ads/{ref}/pause');
  }

  @Post('/marketing/ads/:ref/budget')
  async setAdBudget(req: Request, res: Response) {
    return this.handle(req, res, 'marketing/ads/{ref}/budget');
  }

  @Post('/marketing/ads/:ref/optimization')
  async setAdOptimization(req: Request, res: Response) {
    return this.handle(req, res, 'marketing/ads/{ref}/optimization');
  }

  @Post('/marketing/metrics/sync')
  async syncMetrics(req: Request, res: Response) {
    return this.handle(req, res, 'marketing/metrics/sync');
  }

  @Post('/marketing/outcomes')
  async recordOutcome(req: Request, res: Response) {
    return this.handle(req, res, 'marketing/outcomes');
  }

  @Post('/notifications/admins')
  async notifyAdmins(req: Request, res: Response) {
    return this.handle(req, res, 'notifications/admins');
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

  @Post('/market/observations')
  async recordMarketObservations(req: Request, res: Response) {
    return this.handle(req, res, 'market/observations');
  }

  @Post('/actions/:key/revert')
  async revert(req: Request, res: Response) {
    try {
      const service = await this.requireService<AgentActionService>();
      const result = await service.revert(
        req.header('Idempotency-Key'),
        req.params.key,
        req.header('X-Agent-Context'),
        req.header('traceparent'),
      );
      return res.status(200).json(result);
    } catch (error) {
      return sendAgentError(res, error, "AgentApiController's revert");
    }
  }
}
