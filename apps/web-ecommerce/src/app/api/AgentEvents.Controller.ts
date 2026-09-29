import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type CiEventService from '../../core/server/services/CiEventService';
import HttpError from '../../shared/server/utils/HttpError';
import { isValidAgentSignature, sendAgentError } from '../../shared/server/utils/AgentApiUtils';

// Events webhook of the CI agent (packages/contracts/events/web-events.schema.json). Authenticated by the
// X-CI-Signature HMAC over the raw body (AGENT_EVENTS_SECRET, = WEB_EVENTS_SECRET on the agent side).
@Controller('/agent/v1/events')
@ControllerModel('CiEventModel')
export default class AgentEventsController extends ApiBaseController {
  @Post('/')
  async receiveEvents(req: Request, res: Response) {
    try {
      const secret = process.env.AGENT_EVENTS_SECRET;
      if (!secret) throw new HttpError(503, 'Events webhook is not configured (AGENT_EVENTS_SECRET is not set)');
      if (!isValidAgentSignature(req.rawBody, req.header('X-CI-Signature'), secret)) {
        throw new HttpError(401, 'Invalid signature');
      }
      const service = await this.requireService<CiEventService>();
      return res.status(200).json(await service.ingest(req.body));
    } catch (error) {
      return sendAgentError(res, error, "AgentEventsController's receiveEvents");
    }
  }
}
