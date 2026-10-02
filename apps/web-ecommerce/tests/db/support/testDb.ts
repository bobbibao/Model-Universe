import express from 'express';
import 'reflect-metadata';
import type { Sequelize } from 'sequelize-typescript';
import { makeUser } from '../../unit/support/gatewayApp';

// Points the web's database settings at the test database (TEST_DB_*). The tests drop and recreate tables, so the
// database must be a throwaway one: its name has to end in `_test`.
export const useTestDatabase = (): void => {
  const name = process.env.TEST_DB_NAME;
  if (!name?.endsWith('_test')) {
    throw new Error('Set TEST_DB_NAME (and TEST_DB_HOST/PORT/USERNAME/PASSWORD) to a throwaway database named *_test');
  }
  process.env.DB_HOST = process.env.TEST_DB_HOST || 'localhost';
  process.env.DB_PORT = process.env.TEST_DB_PORT || '5432';
  process.env.DB_USERNAME = process.env.TEST_DB_USERNAME || 'postgres';
  process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || '';
  process.env.DB_NAME = name;
  process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
};

// The seed's environment: the e2e seed's (strict development profile), a throwaway admin account (stock imports and
// returns are recorded by an admin), and a fixed SEED_NOW.
export const SEED_ENV = {
  SEED_DATA: 'true',
  DROP_TABLES: 'true',
  SEED_PROFILE: 'development',
  STRICT_SEED: 'true',
  SEED_RANDOM_SEED: '7',
  ADMIN_EMAIL: 'admin@test.example',
  ADMIN_PASSWORD: 'Test-admin-password-1',
};

// A freshly seeded shop, models loaded, views created. One per test file: Jest gives every file its own module
// registry, hence its own DatabaseProvider. SEED_NOW is close to the real time: the views compute "the last 30 days"
// with NOW().
export const seedTestDatabase = async (seedNow = new Date().toISOString()): Promise<Sequelize> => {
  useTestDatabase();
  Object.assign(process.env, { ...SEED_ENV, SEED_NOW: seedNow });
  const DatabaseProvider = (await import('../../../src/core/server/database/Database.Provider')).default;
  await DatabaseProvider.initialize();
  return DatabaseProvider.getInstance();
};

// An Express app with the given controllers' routes under /api and a signed-in admin (header `x-test-role: ADMIN`).
export const testApp = async (...controllers: string[]) => {
  const { router } = await import('../../../src/shared/server/decorators/controller.decorator');
  for (const controller of controllers) await import(`../../../src/app/api/${controller}`);
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use((req, _res, next) => {
    const role = req.header('x-test-role');
    if (role === 'ADMIN' || role === 'USER') req.user = makeUser(role);
    next();
  });
  app.use('/api', router);
  return app;
};
