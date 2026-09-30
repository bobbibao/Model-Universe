import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type AgentGatewayService from '../../core/server/services/AgentGatewayService';
import HttpError from '../../shared/server/utils/HttpError';

// Agent console gateway (admin only, via the /admin prefix): /api/admin/agent/server/<Agent Server path>. Answers are
// the Agent Server's own JSON (the browser uses @langchain/langgraph-sdk), and streams are relayed as they arrive.
@Controller('/admin/agent')
@ControllerModel('AgentGatewayModel')
export default class AdminAgentController extends ApiBaseController {
  @Get('/server/*')
  async proxyGet(req: Request, res: Response) {
    return this.proxy(req, res);
  }

  @Post('/server/*')
  async proxyPost(req: Request, res: Response) {
    return this.proxy(req, res);
  }

  private async proxy(req: Request, res: Response) {
    const aborter = new AbortController();
    res.on('close', () => aborter.abort());
    try {
      if (!req.user) throw HttpError.unauthorized();
      const service = await this.requireService<AgentGatewayService>();
      const upstream = await service.forward(req.user, req.method, `/${req.params[0]}`, {
        query: req.query as Record<string, unknown>,
        body: req.body,
        signal: aborter.signal,
      });
      if (upstream.stream) {
        res.writeHead(upstream.status, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        const stream = upstream.data as NodeJS.ReadableStream;
        stream.on('error', () => res.end());
        stream.pipe(res);
        return;
      }
      return res.status(upstream.status).json(upstream.data ?? null);
    } catch (error) {
      if (aborter.signal.aborted) return;
      return this.handleError(res, error, "AdminAgentController's proxy");
    }
  }
}
