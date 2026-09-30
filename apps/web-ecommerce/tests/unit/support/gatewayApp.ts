import express from 'express';
import 'reflect-metadata';
import type { AuthUser } from '../../../src/shared/server/types/express';

// An Express app with the real controllers' router and a signed-in user chosen per request (`x-test-role`), so
// supertest can drive /api/admin/agent/server/* without a database.
export const AGENT_SERVER = 'http://agent-server.test';

export const makeUser = (role: 'ADMIN' | 'USER' = 'ADMIN'): AuthUser => ({
  id: 7,
  email: 'owner@example.test',
  firstName: 'Chủ',
  lastName: 'Shop',
  role,
  isActive: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

export const gatewayApp = async () => {
  process.env.AGENT_SERVER_URL = AGENT_SERVER;
  process.env.AGENT_ACTOR_SECRET = 'gateway-test-actor-secret-0123456789abcdef';
  process.env.AGENT_APPROVAL_SECRET = 'gateway-test-approval-secret-0123456789abc';
  const { router } = await import('../../../src/shared/server/decorators/controller.decorator');
  await import('../../../src/app/api/AdminAgent.Controller');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const role = req.header('x-test-role');
    if (role === 'ADMIN' || role === 'USER') req.user = makeUser(role);
    next();
  });
  app.use('/api', router);
  return app;
};
