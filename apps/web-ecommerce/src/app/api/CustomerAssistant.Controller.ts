import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import CustomerAssistantService from '../../core/server/services/CustomerAssistantService';
import HttpError from '../../shared/server/utils/HttpError';
import Logger from '../../shared/server/utils/logger';
import type { AssistantStreamEvent } from '../../shared/types/customer-assistant';
import type { Request, Response } from 'express';

const WINDOW_MS = 10 * 60000;
const setting = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};
// Per-process caps, counting guests and accounts by IP so an attacker cannot cycle accounts:
// ASSISTANT_MAX_CONCURRENT turns run at once (more wait up to ASSISTANT_QUEUE_SECONDS for a slot), and each IP may send
// ASSISTANT_RATE_LIMIT turns per 10 minutes, one at a time.
const limits = new Map<string, { count: number; resetAt: number; active: boolean }>();
let active = 0;
const waiting: (() => void)[] = [];
const acquire = (timeoutMs: number) =>
  new Promise<boolean>((resolve) => {
    if (active < setting('ASSISTANT_MAX_CONCURRENT', 16)) {
      active++;
      return resolve(true);
    }
    const grant = () => {
      clearTimeout(timer);
      active++;
      resolve(true);
    };
    const timer = setTimeout(() => {
      waiting.splice(waiting.indexOf(grant), 1);
      resolve(false);
    }, timeoutMs);
    waiting.push(grant);
  });
const release = () => {
  active--;
  waiting.shift()?.();
};

@Controller('/assistant')
export default class CustomerAssistantController extends ApiBaseController {
  @Post('/chat')
  async chat(req: Request, res: Response) {
    const now = Date.now();
    for (const [key, state] of limits) if (state.resetAt <= now && !state.active) limits.delete(key);
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const state = limits.get(key) || { count: 0, resetAt: now + WINDOW_MS, active: false };
    const busy = (retryAfterSeconds: number) => {
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return this.handleError(
        res,
        new HttpError(429, 'Agent đang xử lý nhiều yêu cầu. Vui lòng chờ một chút rồi thử lại.'),
        'CustomerAssistant',
      );
    };
    if (state.active) return busy(5);
    if (state.count >= setting('ASSISTANT_RATE_LIMIT', 60))
      return busy(Math.max(1, Math.ceil((state.resetAt - now) / 1000)));
    state.count++;
    state.active = true;
    limits.set(key, state);
    const cancellation = new AbortController();
    const disconnected = () => cancellation.abort();
    res.once('close', disconnected);
    try {
      if (!(await acquire(setting('ASSISTANT_QUEUE_SECONDS', 15) * 1000))) return busy(10);
      try {
        await this.respond(req, res, cancellation.signal);
      } finally {
        release();
      }
    } finally {
      res.off('close', disconnected);
      state.active = false;
    }
  }

  // JSON by default; with `Accept: application/x-ndjson` the browser receives progress lines while the reply is
  // prepared, then the reply (or an error) as the last line.
  private async respond(req: Request, res: Response, signal: AbortSignal) {
    res.setHeader('Cache-Control', 'no-store');
    const service = new CustomerAssistantService();
    if (!String(req.headers.accept || '').includes('application/x-ndjson')) {
      try {
        const reply = await service.chat(req.user, req.body, signal);
        if (!res.destroyed) this.sendSuccess(res, reply);
      } catch (error) {
        if (!res.destroyed) this.handleError(res, error, 'CustomerAssistant');
      }
      return;
    }
    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('X-Accel-Buffering', 'no'); // reverse proxies must not hold the progress lines back
    res.flushHeaders();
    const send = (event: AssistantStreamEvent) => {
      if (!res.destroyed) res.write(`${JSON.stringify(event)}\n`);
    };
    try {
      const reply = await service.chat(req.user, req.body, signal, (progress) =>
        send({ type: 'progress', ...progress }),
      );
      send({ type: 'reply', data: reply });
    } catch (error) {
      if (!(error instanceof HttpError)) Logger.ERROR('Error in CustomerAssistant: ', error);
      send({
        type: 'error',
        status: error instanceof HttpError ? error.statusCode : 500,
        message: error instanceof HttpError ? error.message : 'Something went wrong. Please try again.',
      });
    }
    res.end();
  }
}
