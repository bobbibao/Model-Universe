import type { Express } from 'express';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase, testApp } from './support/testDb';
import { callAgent, callApproved, establishedProducts, select, useApprovalSecret } from './support/agentApi';
import { adPlatform, FakeAdPlatform } from '../../src/core/server/services/marketing/platforms';

// Paid ads through the Agent API on the fake platforms (META_ADS_MODE=fake ...): created paused with the whole budget
// reserved in the month's ledger, activated only with a grant, paused at any time, budget changes reserve or release
// the difference, revert releases what the ad did not spend, and the metrics sync books the platforms' spend.
describe('Agent API: ads', () => {
  let sequelize: Sequelize;
  let app: Express;
  let sku: string;
  const meta = () => adPlatform('meta') as FakeAdPlatform;
  const ledger = async () => {
    const [period] = await select<{ reservedVnd: number; spentVnd: number; capVnd: number }>(
      sequelize,
      `SELECT "reservedVnd", "spentVnd", "capVnd" FROM marketing_budget_period ORDER BY period DESC LIMIT 1`,
    );
    return period;
  };
  // Spend is booked in the month it happened, so a sync can touch last month's period too.
  const spentAllMonths = async () => {
    const [row] = await select<{ spent: number }>(
      sequelize,
      'SELECT COALESCE(SUM("spentVnd"), 0)::int AS spent FROM marketing_budget_period',
    );
    return row.spent;
  };
  const ad = async (ref: string) => {
    const [row] = await select<Record<string, unknown>>(
      sequelize,
      `SELECT status, objective, "dailyBudgetVnd", "totalBudgetVnd", "externalId", "activatedAt" IS NOT NULL AS activated
       FROM ad_campaign WHERE ref = :ref`,
      { ref },
    );
    return row;
  };
  const metaAd = (ref: string, extra: Record<string, unknown> = {}) => ({
    ref,
    campaign_ref: 'ag-ads00001-opt1',
    platform: 'meta',
    daily_budget_vnd: 200000,
    duration_days: 5,
    link_path: '/products?category=shoes',
    headline: 'Giày mới mùa thu',
    primary_text: 'Êm chân cả ngày, nhiều mẫu mới.',
    sku,
    ...extra,
  });

  beforeAll(async () => {
    useApprovalSecret();
    sequelize = await seedTestDatabase();
    app = await testApp('AgentApi.Controller');
    [{ sku }] = await establishedProducts(sequelize, 1);
    const campaign = await callApproved(app, {
      path: 'marketing/campaigns',
      key: 'a:campaign',
      body: {
        ref: 'ag-ads00001-opt1',
        name: 'Quảng cáo giày',
        objective: 'sales',
        channels: ['ads_meta', 'ads_tiktok'],
        duration_days: 10,
        budget_vnd: 3000000,
      },
    });
    expect(campaign.status).toBe(200);
  }, 600_000);
  afterAll(() => sequelize.close());

  it('creates the ad paused on the platform and reserves its whole budget', async () => {
    const before = await ledger();
    const response = await callApproved(app, { path: 'marketing/ads', key: 'a:ad:1', body: metaAd('ad-meta-1') });
    expect(response.status).toBe(200);
    expect(await ad('ad-meta-1')).toMatchObject({
      status: 'paused',
      objective: 'traffic',
      dailyBudgetVnd: 200000,
      totalBudgetVnd: 1000000,
      externalId: 'fake-meta-ad-meta-1',
      activated: false,
    });
    expect((await ledger()).reservedVnd - (before?.reservedVnd ?? 0)).toBe(1000000);
    const created = meta().calls.find((call) => call.method === 'createPaused' && call.ref === 'ad-meta-1');
    const spec = created?.args as { landingUrl: string; creative: { imageUrl: string | null; headline: string } };
    expect(new URL(spec.landingUrl).searchParams.get('utm_campaign')).toBe('ag-ads00001-opt1');
    expect(new URL(spec.landingUrl).searchParams.get('utm_content')).toBe('ad-meta-1');
    expect(spec.creative.headline).toBe('Giày mới mùa thu');
  });

  it('activates only with a grant (ads_meta is in shadow) and pauses without one', async () => {
    const refused = await callAgent(app, { path: 'marketing/ads/ad-meta-1/activate', key: 'a:act:1' });
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ code: 'approval_required', reason: 'shadow' });

    const activated = await callApproved(app, { path: 'marketing/ads/ad-meta-1/activate', key: 'a:act:2' });
    expect(activated.status).toBe(200);
    expect(await ad('ad-meta-1')).toMatchObject({ status: 'active', activated: true });

    const paused = await callAgent(app, {
      path: 'marketing/ads/ad-meta-1/pause',
      key: 'a:pause:1',
      body: { reason: 'test' },
    });
    expect(paused.status).toBe(200);
    expect(await ad('ad-meta-1')).toMatchObject({ status: 'paused' });
    const again = await callAgent(app, { path: 'marketing/ads/ad-meta-1/pause', key: 'a:pause:2' });
    expect(again.status).toBe(200);
    expect(again.body.detail).toMatch(/nothing to pause/);
    expect(meta().calls.map((call) => call.method)).toEqual(expect.arrayContaining(['activate', 'pause']));

    const unknown = await callAgent(app, { path: 'marketing/ads/ad-nope/pause', key: 'a:pause:3' });
    expect(unknown.status).toBe(404);
  });

  it('raises a budget with a grant (reserving the difference) and lowers it without one', async () => {
    const before = await ledger();
    const refused = await callAgent(app, {
      path: 'marketing/ads/ad-meta-1/budget',
      key: 'a:budget:1',
      body: { daily_budget_vnd: 250000 },
    });
    expect(refused.status).toBe(403);
    const raised = await callApproved(app, {
      path: 'marketing/ads/ad-meta-1/budget',
      key: 'a:budget:2',
      body: { daily_budget_vnd: 250000 },
    });
    expect(raised.status).toBe(200);
    const extra = (await ledger()).reservedVnd - before.reservedVnd;
    expect(extra).toBeGreaterThanOrEqual(50000 * 5);
    expect(await ad('ad-meta-1')).toMatchObject({ dailyBudgetVnd: 250000, totalBudgetVnd: 1000000 + extra });

    const capped = await callApproved(app, {
      path: 'marketing/ads/ad-meta-1/budget',
      key: 'a:budget:3',
      body: { daily_budget_vnd: 900000 },
    });
    expect(capped.status).toBe(422);
    expect(capped.body.reason).toBe('per_day_cap');

    const lowered = await callAgent(app, {
      path: 'marketing/ads/ad-meta-1/budget',
      key: 'a:budget:4',
      body: { daily_budget_vnd: 200000 },
    });
    expect(lowered.status).toBe(200);
    expect((await ledger()).reservedVnd).toBe(before.reservedVnd);
    const [audit] = await select<{ writeClass: string }>(
      sequelize,
      `SELECT "writeClass" FROM agent_action WHERE "idempotencyKey" = 'a:budget:4'`,
    );
    expect(audit.writeClass).toBe('protective');
  });

  it('switches the bidding with a grant', async () => {
    const response = await callApproved(app, {
      path: 'marketing/ads/ad-meta-1/optimization',
      key: 'a:opt:1',
      body: { objective: 'conversions' },
    });
    expect(response.status).toBe(200);
    expect(await ad('ad-meta-1')).toMatchObject({ objective: 'conversions' });
    expect(meta().calls).toContainEqual({ method: 'setObjective', ref: 'ad-meta-1', args: 'conversions' });
  });

  it('refuses a TikTok ad without a video, and a daily budget above the cap', async () => {
    const [{ id: imageId }] = await select<{ id: number }>(
      sequelize,
      `INSERT INTO marketing_asset (kind, url, title, "createdAt", "updatedAt")
       VALUES ('image', '/uploads/banner.jpg', 'Banner', NOW(), NOW()) RETURNING id`,
    );
    const tiktok = await callApproved(app, {
      path: 'marketing/ads',
      key: 'a:ad:tiktok',
      body: {
        ref: 'ad-tiktok-1',
        campaign_ref: 'ag-ads00001-opt1',
        platform: 'tiktok',
        daily_budget_vnd: 100000,
        duration_days: 3,
        link_path: '/',
        ad_text: 'Giày mới',
        asset_id: imageId,
      },
    });
    expect(tiktok.status).toBe(422);
    expect(tiktok.body.reason).toBe('video_required');

    const perDay = await callApproved(app, {
      path: 'marketing/ads',
      key: 'a:ad:big',
      body: metaAd('ad-meta-big', { daily_budget_vnd: 600000, duration_days: 2 }),
    });
    expect(perDay.status).toBe(422);
    expect(perDay.body.reason).toBe('per_day_cap');
  });

  it('books the platform spend in the ledger on a metrics sync, once per key', async () => {
    const created = await callApproved(app, {
      path: 'marketing/ads',
      key: 'a:ad:2',
      body: metaAd('ad-meta-2', { daily_budget_vnd: 100000 }),
    });
    expect(created.status).toBe(200);
    await callApproved(app, { path: 'marketing/ads/ad-meta-2/activate', key: 'a:act:3' });
    // It started delivering two days ago.
    await sequelize.query(`UPDATE ad_campaign SET "activatedAt" = NOW() - INTERVAL '2 days' WHERE ref = 'ad-meta-2'`);
    const before = await spentAllMonths();
    const sync = await callAgent(app, {
      path: 'marketing/metrics/sync',
      key: 'sync:test:1',
      body: { lookback_days: 3 },
    });
    expect(sync.status).toBe(200);
    expect(sync.body.detail).toMatch(/synced/);
    const rows = await select<{ spendVnd: number }>(
      sequelize,
      `SELECT "spendVnd" FROM ad_metric_daily WHERE "adRef" = 'ad-meta-2'`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.reduce((sum, row) => sum + row.spendVnd, 0)).toBeGreaterThan(0);
    // Every delivering (or paused) agent ad was read: ad-meta-1 too.
    const [{ spent }] = await select<{ spent: number }>(
      sequelize,
      'SELECT SUM("spendVnd")::int AS spent FROM ad_metric_daily',
    );
    expect((await spentAllMonths()) - before).toBe(spent);

    const replay = await callAgent(app, {
      path: 'marketing/metrics/sync',
      key: 'sync:test:1',
      body: { lookback_days: 3 },
    });
    expect(replay.body).toEqual(sync.body);
    // A later sync books only what is new.
    await callAgent(app, { path: 'marketing/metrics/sync', key: 'sync:test:2', body: { lookback_days: 3 } });
    expect((await spentAllMonths()) - before).toBe(spent);
  });

  it('releases what the ad did not spend when it is reverted', async () => {
    const before = await ledger();
    const [{ unspent }] = await select<{ unspent: number }>(
      sequelize,
      `SELECT SUM(CASE kind WHEN 'reserve' THEN "amountVnd" ELSE -"amountVnd" END)::int AS unspent
       FROM marketing_budget_entry WHERE "adRef" = 'ad-meta-2'`,
    );
    const revert = await callAgent(app, { path: 'actions/a:ad:2/revert', key: 'a:ad:2:revert' });
    expect(revert.status).toBe(200);
    expect(revert.body.detail).toMatch(new RegExp(`${unspent} VND released`));
    expect(await ad('ad-meta-2')).toMatchObject({ status: 'reverted' });
    expect(before.reservedVnd - (await ledger()).reservedVnd).toBe(unspent);
  });
});
