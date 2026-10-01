import type { Express } from 'express';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase, testApp } from './support/testDb';
import {
  callAgent,
  callApproved,
  establishedProducts,
  grantFor,
  select,
  setAutonomy,
  useApprovalSecret,
} from './support/agentApi';

// The approval grant (docs/GROWTH_AGENT.md section 4): a shop_change with a new key needs a grant covering exactly
// this request (action, endpoint, key, body hash), or its capability in auto_low and the request inside the low
// caps. A replay of the same key and body answers the stored response first.
describe('Agent API: approval grants', () => {
  let sequelize: Sequelize;
  let app: Express;
  let skus: string[];
  beforeAll(async () => {
    useApprovalSecret();
    sequelize = await seedTestDatabase();
    app = await testApp('AgentApi.Controller');
    skus = (await establishedProducts(sequelize, 12)).map((p) => p.sku);
  }, 600_000);
  afterAll(() => sequelize.close());

  // Starting tomorrow, so these discounts never count against the 3 running agent promotions.
  const tomorrow = new Date(Date.now() + 24 * 3600_000).toISOString();
  const discount = (sku: string, percent = 10) => ({ skus: [sku], percent, duration_days: 5, starts_at: tomorrow });

  it('refuses a request without a grant while the capability asks a person', async () => {
    const response = await callAgent(app, { path: 'pricing/discounts', key: 'g:none', body: discount(skus[0]) });
    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: expect.any(String),
      code: 'approval_required',
      reason: 'ask',
    });
  });

  it('refuses a tampered, expired, body-mismatched, re-keyed or wrong-endpoint grant', async () => {
    const body = discount(skus[0]);
    const valid = await grantFor([{ actionId: 'a1', path: 'pricing/discounts', key: 'g:1', body }]);
    const [header, payload, signature] = valid.split('.');
    const tampered = `${header}.${payload}.${signature.slice(0, -2)}${signature.endsWith('A') ? 'B' : 'A'}`;
    const expired = await grantFor([{ actionId: 'a1', path: 'pricing/discounts', key: 'g:1', body }], {
      now: Math.floor(Date.now() / 1000) - 2 * 24 * 3600,
    });
    const wrongEndpoint = await grantFor([{ actionId: 'a1', path: 'promotions/coupons', key: 'g:1', body }]);

    const cases = [
      { grant: tampered, key: 'g:1', body },
      { grant: expired, key: 'g:1', body },
      { grant: valid, key: 'g:1', body: { ...body, percent: 12 } },
      { grant: valid, key: 'g:other-key', body },
      { grant: wrongEndpoint, key: 'g:1', body },
    ];
    for (const item of cases) {
      const response = await callAgent(app, { path: 'pricing/discounts', actionId: 'a1', ...item });
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'approval_required', reason: 'invalid_grant' });
    }
    // An action the grant does not list.
    const unknown = await callAgent(app, { path: 'pricing/discounts', key: 'g:1', body, grant: valid, actionId: 'a2' });
    expect(unknown.status).toBe(403);
    // None of them consumed the key or wrote anything.
    expect(await select(sequelize, `SELECT 1 FROM agent_action WHERE "idempotencyKey" = 'g:1'`)).toHaveLength(0);
  });

  it('applies a request its grant covers, records the grant, and replays it under the same key', async () => {
    const body = discount(skus[1]);
    const grant = await grantFor([{ actionId: 'a1', path: 'pricing/discounts', key: 'g:ok', body }], { approverId: 3 });
    const first = await callAgent(app, {
      path: 'pricing/discounts',
      key: 'g:ok',
      body,
      grant,
      actionId: 'a1',
      context: { thread_id: 'thread-1', option_id: 'opt-1', step_no: 1, risk_tier: 'low', model_profile: 'scripted' },
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
    });
    expect(first.status).toBe(200);
    expect(first.body.ref).toMatch(/^agent-action-\d+$/);
    const [row] = await select<Record<string, unknown>>(
      sequelize,
      `SELECT "writeClass", "approvalMode", "approverUserId", "grantJti" IS NOT NULL AS has_jti, "threadId", "optionId",
              "actionId", "stepNo", "riskTier", "policyVersion", "modelProfile", "traceId"
       FROM agent_action WHERE "idempotencyKey" = 'g:ok'`,
    );
    expect(row).toEqual({
      writeClass: 'shop_change',
      approvalMode: 'grant',
      approverUserId: 3,
      has_jti: true,
      threadId: 'thread-1',
      optionId: 'opt-1',
      actionId: 'a1',
      stepNo: 1,
      riskTier: 'low',
      policyVersion: expect.any(String),
      modelProfile: 'scripted',
      traceId: '0af7651916cd43dd8448eb211c80319c',
    });

    // The same key and body: the stored response, even without the grant (the replay never re-checks).
    const replay = await callAgent(app, { path: 'pricing/discounts', key: 'g:ok', body });
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);
    // The same key with another body is a conflict.
    const conflict = await callAgent(app, { path: 'pricing/discounts', key: 'g:ok', body: discount(skus[1], 11) });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('conflict');
  });

  it('applies a low-risk request without a grant only in auto_low and inside the low caps', async () => {
    await setAutonomy(sequelize, { promotion: 'auto_low' });
    const within = await callAgent(app, { path: 'pricing/discounts', key: 'g:auto', body: discount(skus[2], 10) });
    expect(within.status).toBe(200);
    const [row] = await select<{ approvalMode: string }>(
      sequelize,
      `SELECT "approvalMode" FROM agent_action WHERE "idempotencyKey" = 'g:auto'`,
    );
    expect(row.approvalMode).toBe('auto_low');

    const above = await callAgent(app, { path: 'pricing/discounts', key: 'g:auto-high', body: discount(skus[3], 20) });
    expect(above.status).toBe(403);
    expect(above.body).toMatchObject({ code: 'approval_required', reason: 'above_low_caps' });

    // With a grant the same request is a person's decision and runs.
    const approved = await callApproved(app, {
      path: 'pricing/discounts',
      key: 'g:auto-high',
      body: discount(skus[3], 20),
    });
    expect(approved.status).toBe(200);
    await setAutonomy(sequelize, { promotion: 'ask' });
  });

  it('validates the body before anything else (400 with details) and previews a dry run without the key', async () => {
    const bad = await callApproved(app, { path: 'pricing/discounts', key: 'g:bad', body: { percent: 10 } });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('invalid_request');
    expect(bad.body.details).toEqual(expect.arrayContaining(['duration_days is required']));

    const body = discount(skus[4]);
    const grant = await grantFor([{ actionId: 'a1', path: 'pricing/discounts', key: 'g:dry', body }]);
    const dry = await callAgent(app, {
      path: 'pricing/discounts',
      key: 'g:dry',
      body: { ...body, dry_run: true },
      grant,
      actionId: 'a1',
    });
    expect(dry.status).toBe(200);
    expect(dry.body.ref).toBe('dry-run');
    expect(await select(sequelize, `SELECT 1 FROM agent_action WHERE "idempotencyKey" = 'g:dry'`)).toHaveLength(0);
    const real = await callAgent(app, { path: 'pricing/discounts', key: 'g:dry', body, grant, actionId: 'a1' });
    expect(real.status).toBe(200);
  });
});
