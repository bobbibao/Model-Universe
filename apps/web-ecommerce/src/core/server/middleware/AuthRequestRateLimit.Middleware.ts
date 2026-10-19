import type { Request, Response, NextFunction } from 'express';
import ApiResponse from '../../../shared/server/utils/ApiResponseUtils';

// Like the existing login limiter, this applies per process. The database also serializes reset-email cooldowns.
const requests = new Map<string, { count: number; until: number }>();
const WINDOW_MS = 15 * 60_000;
export function AuthRequestRateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  for (const [key, value] of requests) if (value.until <= now) requests.delete(key);
  const key = `${req.path}:${req.ip || req.socket.remoteAddress}`;
  const counter = requests.get(key) ?? { count: 0, until: now + WINDOW_MS };
  const max = req.path.endsWith('/forgot-password') ? 10 : 30;
  if (counter.count >= max) {
    res.setHeader('Retry-After', String(Math.ceil((counter.until - now) / 1000)));
    return new ApiResponse({
      statusCode: 429,
      toastType: 'error',
      userMessages: ['Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.'],
    }).send(res);
  }
  counter.count++;
  requests.set(key, counter);
  next();
}
