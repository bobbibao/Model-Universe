import { NextFunction, Request, Response } from 'express';
import ApiResponse from '../../../shared/server/utils/ApiResponseUtils';
import { normalizeEmail } from '../../../shared/server/utils/ValidationUtils';

// Brute-force protection for POST /api/auth/login. Only failed attempts are counted, per IP + email
// (one account) and per IP (many accounts); a successful login clears the account counter.
// State is in memory, so limits apply per server process.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_ACCOUNT = 5;
const MAX_FAILURES_PER_IP = 20;
const SWEEP_THRESHOLD = 10000;

interface Counter {
  count: number;
  resetAt: number;
}

const failures = new Map<string, Counter>();

const activeCounter = (key: string, now: number): Counter | undefined => {
  const counter = failures.get(key);
  if (counter && counter.resetAt <= now) {
    failures.delete(key);
    return undefined;
  }
  return counter;
};

const recordFailure = (key: string, now: number) => {
  const counter = activeCounter(key, now);
  if (counter) counter.count++;
  else failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
};

const sweepExpired = (now: number) => {
  if (failures.size < SWEEP_THRESHOLD) return;
  failures.forEach((counter, key) => counter.resetAt <= now && failures.delete(key));
};

export function LoginRateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  sweepExpired(now);
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const ipKey = `ip:${ip}`;
  const accountKey = `account:${ip}:${normalizeEmail(req.body?.email)}`;

  const limits: [string, number][] = [
    [accountKey, MAX_FAILURES_PER_ACCOUNT],
    [ipKey, MAX_FAILURES_PER_IP],
  ];
  const blocked = limits
    .map(([key, max]) => ({ counter: activeCounter(key, now), max }))
    .find(({ counter, max }) => counter && counter.count >= max);
  if (blocked?.counter) {
    const retryAfterSeconds = Math.ceil((blocked.counter.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfterSeconds));
    return new ApiResponse({
      statusCode: 429,
      toastType: 'error',
      userMessages: [
        `Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${Math.ceil(retryAfterSeconds / 60)} phút.`,
      ],
    }).send(res);
  }

  res.on('finish', () => {
    // 2xx: signed in. 400/403: wrong credentials or locked account. 5xx is not the user's fault.
    if (res.statusCode < 300) failures.delete(accountKey);
    else if (res.statusCode === 400 || res.statusCode === 403)
      limits.forEach(([key]) => recordFailure(key, Date.now()));
  });
  next();
}
