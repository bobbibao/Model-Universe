import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import CustomerAssistantService from '../../core/server/services/CustomerAssistantService';
import HttpError from '../../shared/server/utils/HttpError';
import type { Request, Response } from 'express';

// Per-process request and concurrency caps. Count both guests and accounts by IP to prevent account cycling.
const limits = new Map<string, { count: number; resetAt: number; active: boolean }>();
let active = 0;
@Controller('/assistant')
export default class CustomerAssistantController extends ApiBaseController {
  @Post('/chat')
  async chat(req: Request, res: Response) {
    const now = Date.now();
    for (const [key, state] of limits) if (state.resetAt <= now && !state.active) limits.delete(key);
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const state = limits.get(key) || { count: 0, resetAt: now + 10 * 60000, active: false };
    if (state.active || active >= 6 || state.count >= 20) {
      res.setHeader(
        'Retry-After',
        state.active || active >= 6 ? '10' : String(Math.max(1, Math.ceil((state.resetAt - now) / 1000))),
      );
      return this.handleError(
        res,
        new HttpError(429, 'Agent đang xử lý nhiều yêu cầu. Vui lòng chờ một chút rồi thử lại.'),
        'CustomerAssistant',
      );
    }
    state.count++;
    state.active = true;
    limits.set(key, state);
    active++;
    res.setHeader('Cache-Control', 'no-store');
    const cancellation = new AbortController();
    const disconnected = () => cancellation.abort();
    res.once('close', disconnected);
    try {
      const reply = await new CustomerAssistantService().chat(req.user, req.body, cancellation.signal);
      if (!res.destroyed) return this.sendSuccess(res, reply);
    } catch (error) {
      if (!res.destroyed) return this.handleError(res, error, 'CustomerAssistant');
    } finally {
      res.off('close', disconnected);
      state.active = false;
      active--;
    }
  }
}
