import { NextFunction, Request, Response } from 'express';
import { safeEqual } from '../../../shared/server/utils/AgentApiUtils';

// Guards the Agent API (/api/agent/v1/*): only the shop agent, holding AGENT_API_TOKEN
// (SHOP_API_TOKEN on the agent side), may call it.
export function AgentServiceAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.AGENT_API_TOKEN;
  if (!expected) {
    return res.status(503).json({ error: 'Agent API is not configured (AGENT_API_TOKEN is not set)' });
  }
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token || !safeEqual(token, expected)) {
    return res.status(401).json({ error: 'Invalid service token' });
  }
  return next();
}
