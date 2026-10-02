import fs from 'fs';
import path from 'path';
import {
  AGENT_ROUTES,
  evaluate,
  type AgentRoute,
  type ShopState,
} from '../../src/core/server/services/agent/AgentLimits';
import { AGENT_SETTING_DEFAULTS, type AgentSettings } from '../../src/core/server/services/AgentSettingDefinitions';

// packages/contracts/test-vectors/limits/requests.json: what the Agent API answers for a request over a shop state.
// The agent asserts the same file against its own copy of the rules (FakeShop, validate).
const doc = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../packages/contracts/test-vectors/limits/requests.json'), 'utf-8'),
);

type RawState = Record<string, unknown>;

// The vectors' merge rule: settings by key, and one level deep for object values.
const settings = (overrides: Record<string, unknown>): AgentSettings => {
  const merged: Record<string, unknown> = { ...AGENT_SETTING_DEFAULTS };
  for (const [key, value] of Object.entries(overrides)) {
    merged[key] =
      value && typeof value === 'object' && !Array.isArray(value)
        ? { ...(merged[key] as object), ...(value as object) }
        : value;
  }
  return merged as unknown as AgentSettings;
};

const dates = <T extends Record<string, unknown>>(rows: T[], fields: string[]) =>
  rows.map((row) => ({
    ...row,
    ...Object.fromEntries(
      fields.filter((f) => f in row).map((f) => [f, row[f] === null ? null : new Date(row[f] as string)]),
    ),
  }));

const toState = (vector: { state: RawState }): ShopState => {
  const raw = { ...doc.base, ...vector.state } as Record<string, unknown>;
  return {
    now: new Date(raw.now as string),
    settings: settings((raw.settings ?? {}) as Record<string, unknown>),
    products: dates(raw.products as RawState[], ['created_at', 'last_received_at']),
    discounts: dates(raw.discounts as RawState[], ['starts_at', 'ends_at']).map((d) => ({ revoked: false, ...d })),
    coupons: raw.coupons,
    campaigns: raw.campaigns,
    ads: dates(raw.ads as RawState[], ['ends_at']),
    posts: dates(raw.posts as RawState[], ['at']),
    assets: raw.assets,
    budget: raw.budget,
    measured_platforms: raw.measured_platforms,
  } as unknown as ShopState;
};

describe('Agent API limits (contract test vectors)', () => {
  type Vector = {
    name: string;
    endpoint: AgentRoute;
    path: Record<string, string>;
    body: Record<string, unknown>;
    grant: boolean;
    state: RawState;
    expect: { status: number; code?: string; reason?: string };
  };

  it.each(doc.vectors as Vector[])('$name', (v) => {
    const verdict = evaluate(v.endpoint, v.path, v.body, toState(v), v.grant);
    expect({ status: verdict.status, detail: verdict.detail }).toMatchObject({ status: v.expect.status });
    if (v.expect.status !== 200) {
      expect(verdict.code).toBe(v.expect.code);
      if (v.expect.reason) expect(verdict.reason).toBe(v.expect.reason);
    }
  });

  it('covers every route with rules', () => {
    const covered = new Set(doc.vectors.map((v: { endpoint: string }) => v.endpoint));
    expect(AGENT_ROUTES.filter((route) => !covered.has(route))).toEqual(['sop/checklists']);
  });
});
