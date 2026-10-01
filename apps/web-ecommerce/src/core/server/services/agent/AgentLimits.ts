// The shop's rules for the agent's writes (docs/GROWTH_AGENT.md section 4), as a pure function of the request and a
// snapshot of the shop (`ShopState`). AgentPolicyService loads the state and calls `evaluate`; the handlers apply
// what it allows. The agent runs the same rules (apps/agent-service domain/growth/policies.py, in its FakeShop and in
// validate); packages/contracts/test-vectors/limits/requests.json pins both. Field names are the contract's
// (snake_case). Messages are English (machine-to-machine).
//
// Order (packages/contracts/openapi/web-agent-api.yaml): the body (400), the kill switch and the approval (403), the
// references (404), then the limits: 409 when the shop's current state is in the way, 422 when the request itself
// breaks a limit. Protective requests (end a promotion, pause an ad, lower a budget) skip the kill switch and the
// approval.
import type { AgentSettings, AutonomyMode, Capability } from '../AgentSettingDefinitions';

export const POLICY_VERSION = '2026-09-30';

export const LEGAL_MAX_COMBINED = 0.5; // Decree 81/2018 as amended by 128/2024
export const NEW_ARRIVAL_DAYS = 30;
export const PROMO_FREQUENCY_DAYS = 30;
export const DEAD_STOCK_DAYS = 180;
export const MAX_AGENT_PROMOTIONS = 3;
export const POSTS_PER_DAY = 2;
const POST_SPACING_MS = 4 * 3600_000;
const SCHEDULE_MIN_MS = 10 * 60_000;
const SCHEDULE_MAX_MS = 30 * 86_400_000;
const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3600_000; // Asia/Ho_Chi_Minh, no daylight saving
const EPSILON = 1e-9;

// The low-risk caps: without a grant, a request runs only with its capabilities in `auto_low` and inside these.
export const LOW_DISCOUNT_PCT = 15;
export const LOW_DISCOUNT_DAYS = 7;
export const LOW_SKU_COUNT = 20;
export const LOW_COUPON_PCT = 15;
export const LOW_COUPON_DAYS = 7;
export const LOW_CAMPAIGN_BUDGET_VND = 1_500_000;
export const LOW_AD_DAILY_VND = 300_000;
export const LOW_AD_TOTAL_VND = 1_500_000;
export const LOW_AD_DAYS = 5;

// A number followed by a percent or money unit: a post that says one is not organic and needs a person.
const PRICE_CLAIM = /\d\s*(?:%|phần trăm|₫|vnđ|vnd|đ|k|nghìn|ngàn|triệu|tr)/i;

export const GROWTH_CAPABILITIES: Capability[] = ['promotion', 'facebook_post', 'ads_meta', 'ads_google', 'ads_tiktok'];
export const AD_PLATFORMS = ['meta', 'google', 'tiktok'] as const;
export type AdPlatformName = (typeof AD_PLATFORMS)[number];
export const AD_CAPABILITY: Record<AdPlatformName, Capability> = {
  meta: 'ads_meta',
  google: 'ads_google',
  tiktok: 'ads_tiktok',
};

export type WriteClass = 'shop_change' | 'protective' | 'ingestion';
export type ApprovalMode = 'grant' | 'auto_low' | 'protective' | 'ingestion';

// ------------------------------------------------------------------ routes

export const AGENT_ROUTES = [
  'pricing/discounts',
  'inventory/adjustments',
  'tasks',
  'channels/switch',
  'sop/checklists',
  'promotions/coupons',
  'promotions/{ref}/end',
  'marketing/campaigns',
  'marketing/posts',
  'marketing/ads',
  'marketing/ads/{ref}/activate',
  'marketing/ads/{ref}/pause',
  'marketing/ads/{ref}/budget',
  'marketing/ads/{ref}/optimization',
] as const;
export type AgentRoute = (typeof AGENT_ROUTES)[number];

const PROTECTIVE_ROUTES: AgentRoute[] = ['promotions/{ref}/end', 'marketing/ads/{ref}/pause'];
const FIXED_CAPABILITY: Partial<Record<AgentRoute, Capability>> = {
  'pricing/discounts': 'promotion',
  'promotions/coupons': 'promotion',
  'promotions/{ref}/end': 'promotion',
  'marketing/posts': 'facebook_post',
  'inventory/adjustments': 'inventory',
  'channels/switch': 'inventory',
  tasks: 'ops_tasks',
  'sop/checklists': 'ops_tasks',
};

// ------------------------------------------------------------------ bodies (exactly the contract's request bodies)

export interface DiscountBody {
  skus?: string[];
  category?: string;
  percent: number;
  duration_days: number;
  starts_at?: Date | null;
  campaign_ref?: string | null;
  replace_existing?: boolean;
}
export interface InventoryBody {
  sku: string;
  new_status: 'restock' | 'available' | 'quarantine' | 'donation_pending' | 'recycle';
  reason?: string;
}
export interface TaskBody {
  title: string;
  assignee_role: string;
  description?: string | null;
  due_in_days?: number | null;
}
export interface ChannelBody {
  skus: string[];
  to_channel: 'web' | 'outlet';
}
export interface SopBody {
  sop_id: string;
  add_items: string[];
}
export interface CouponBody {
  code: string;
  title: string;
  percent: number;
  duration_days: number;
  starts_at?: Date | null;
  min_order_vnd?: number;
  usage_limit?: number | null;
  campaign_ref?: string | null;
}
export interface ReasonBody {
  reason?: string;
}
export interface CampaignBody {
  ref: string;
  name: string;
  objective: 'sales' | 'traffic' | 'awareness' | 'clearance';
  channels: Capability[];
  thread_id?: string | null;
  starts_at?: Date | null;
  duration_days: number;
  budget_vnd?: number;
}
export interface PostBody {
  ref: string;
  campaign_ref?: string | null;
  message: string;
  link_path?: string | null;
  sku?: string | null;
  asset_id?: number | null;
  scheduled_at?: Date | null;
}
export interface AdBody {
  ref: string;
  campaign_ref: string;
  platform: AdPlatformName;
  objective?: 'traffic' | 'conversions' | null;
  daily_budget_vnd: number;
  duration_days: number;
  starts_at?: Date | null;
  link_path: string;
  headline?: string | null;
  primary_text?: string | null;
  headlines?: string[];
  descriptions?: string[];
  keywords?: string[];
  ad_text?: string | null;
  sku?: string | null;
  asset_id?: number | null;
}
export interface BudgetBody {
  daily_budget_vnd: number;
}
export interface OptimizationBody {
  objective: 'traffic' | 'conversions';
}
export type AgentBody =
  | DiscountBody
  | InventoryBody
  | TaskBody
  | ChannelBody
  | SopBody
  | CouponBody
  | ReasonBody
  | CampaignBody
  | PostBody
  | AdBody
  | BudgetBody
  | OptimizationBody
  | Record<string, never>;

type Raw = Record<string, unknown>;

// Collects a body's problems while reading its fields; `dry_run` is the API's own flag, not part of the body.
export class BodyReader {
  readonly errors: string[] = [];
  private readonly seen = new Set<string>(['dry_run']);

  constructor(private readonly raw: Raw) {}

  private has(name: string): boolean {
    this.seen.add(name);
    return this.raw[name] !== undefined && this.raw[name] !== null;
  }

  private fail(message: string) {
    this.errors.push(message);
  }

  string(
    name: string,
    {
      required = false,
      min = 1,
      max = 255,
      pattern,
    }: { required?: boolean; min?: number; max?: number; pattern?: RegExp } = {},
  ) {
    if (!this.has(name)) {
      if (required) this.fail(`${name} is required`);
      return undefined;
    }
    const value = this.raw[name];
    if (typeof value !== 'string' || value.length < min || value.length > max) {
      this.fail(`${name} must be a string of ${min}-${max} characters`);
      return undefined;
    }
    if (pattern && !pattern.test(value)) this.fail(`${name} has an invalid format`);
    return value;
  }

  number(
    name: string,
    { required = false, min = -Infinity, max = Infinity, integer = false, exclusiveMin = false } = {},
  ) {
    if (!this.has(name)) {
      if (required) this.fail(`${name} is required`);
      return undefined;
    }
    const value = this.raw[name];
    const tooLow = exclusiveMin ? (value as number) <= min : (value as number) < min;
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      (integer && !Number.isInteger(value)) ||
      tooLow ||
      value > max
    ) {
      this.fail(`${name} must be ${integer ? 'an integer' : 'a number'} in ${exclusiveMin ? '(' : '['}${min}, ${max}]`);
      return undefined;
    }
    return value;
  }

  boolean(name: string) {
    if (!this.has(name)) return undefined;
    if (typeof this.raw[name] !== 'boolean') this.fail(`${name} must be true or false`);
    return this.raw[name] as boolean;
  }

  // RFC 3339 date-time with an offset (a late approval never changes the body, so times are absolute).
  dateTime(name: string) {
    if (!this.has(name)) return undefined;
    const value = this.raw[name];
    const valid =
      typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i.test(value);
    if (!valid || Number.isNaN(Date.parse(value as string))) {
      this.fail(`${name} must be a date-time with a time zone`);
      return undefined;
    }
    return new Date(value as string);
  }

  oneOf<T extends string>(name: string, options: readonly T[], { required = false } = {}) {
    if (!this.has(name)) {
      if (required) this.fail(`${name} is required`);
      return undefined;
    }
    const value = this.raw[name] as T;
    if (!options.includes(value)) {
      this.fail(`${name} must be one of ${options.join(', ')}`);
      return undefined;
    }
    return value;
  }

  strings(name: string, { required = false, minItems = 0, maxItems = 500, min = 1, max = 2000, unique = false } = {}) {
    if (!this.has(name)) {
      if (required) this.fail(`${name} is required`);
      return undefined;
    }
    const value = this.raw[name];
    if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
      this.fail(`${name} must be an array of ${minItems}-${maxItems} items`);
      return undefined;
    }
    if (value.some((item) => typeof item !== 'string' || item.length < min || item.length > max)) {
      this.fail(`each ${name} item must be a string of ${min}-${max} characters`);
      return undefined;
    }
    if (unique && new Set(value).size !== value.length) this.fail(`${name} must not repeat`);
    return value as string[];
  }

  object(name: string) {
    if (!this.has(name)) return undefined;
    const value = this.raw[name];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      this.fail(`${name} must be an object`);
      return undefined;
    }
    return value as Record<string, unknown>;
  }

  unknown(): string[] {
    return Object.keys(this.raw).filter((key) => !this.seen.has(key));
  }
}

const REF = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const CAMPAIGN_REF = /^ag-[a-z0-9]{8}-[a-z0-9_-]{1,40}$/;
const COUPON_CODE = /^AI-[A-Z0-9]{4,12}$/;
const LINK_PATH = /^\/\S*$/;

// Reads a request body for a route: the typed body, or the list of problems (400 invalid_request).
export const parseBody = (route: AgentRoute, raw: Raw): { body?: AgentBody; errors: string[] } => {
  const r = new BodyReader(raw);
  const result = (body: AgentBody) => {
    const unknown = r.unknown();
    if (unknown.length > 0) r.errors.push(`unknown field(s): ${unknown.join(', ')}`);
    return r.errors.length > 0 ? { errors: r.errors } : { body, errors: [] };
  };
  switch (route) {
    case 'pricing/discounts': {
      const body: DiscountBody = {
        skus: r.strings('skus', { minItems: 1, maxItems: 500, max: 255 }),
        category: r.string('category', { max: 64 }),
        percent: r.number('percent', { required: true, min: 0, max: 90, exclusiveMin: true }) as number,
        duration_days: r.number('duration_days', { required: true, min: 1, max: 90, integer: true }) as number,
        starts_at: r.dateTime('starts_at'),
        campaign_ref: r.string('campaign_ref', { max: 64 }),
        replace_existing: r.boolean('replace_existing'),
      };
      if ((body.skus === undefined) === (body.category === undefined))
        r.errors.push('exactly one of skus and category');
      return result(body);
    }
    case 'inventory/adjustments':
      return result({
        sku: r.string('sku', { required: true }) as string,
        new_status: r.oneOf(
          'new_status',
          ['restock', 'available', 'quarantine', 'donation_pending', 'recycle'] as const,
          {
            required: true,
          },
        ) as InventoryBody['new_status'],
        reason: r.string('reason', { min: 0, max: 2000 }),
      });
    case 'tasks':
      return result({
        title: r.string('title', { required: true }) as string,
        assignee_role: r.string('assignee_role', { required: true, max: 64 }) as string,
        description: r.string('description', { min: 0, max: 2000 }),
        due_in_days: r.number('due_in_days', { min: 0, max: 365, integer: true }),
      });
    case 'channels/switch':
      return result({
        skus: r.strings('skus', { required: true, minItems: 1, maxItems: 500, max: 255 }) as string[],
        to_channel: r.oneOf('to_channel', ['web', 'outlet'] as const, { required: true }) as ChannelBody['to_channel'],
      });
    case 'sop/checklists':
      return result({
        sop_id: r.string('sop_id', { required: true, max: 64 }) as string,
        add_items: r.strings('add_items', { required: true, minItems: 1, maxItems: 50 }) as string[],
      });
    case 'promotions/coupons':
      return result({
        code: r.string('code', { required: true, max: 15, pattern: COUPON_CODE }) as string,
        title: r.string('title', { required: true }) as string,
        percent: r.number('percent', { required: true, min: 1, max: 50, integer: true }) as number,
        duration_days: r.number('duration_days', { required: true, min: 1, max: 90, integer: true }) as number,
        starts_at: r.dateTime('starts_at'),
        min_order_vnd: r.number('min_order_vnd', { min: 0, max: 1_000_000_000, integer: true }),
        usage_limit: r.number('usage_limit', { min: 1, max: 100_000, integer: true }),
        campaign_ref: r.string('campaign_ref', { max: 64 }),
      });
    case 'promotions/{ref}/end':
    case 'marketing/ads/{ref}/pause':
      return result({ reason: r.string('reason', { min: 0, max: 2000 }) });
    case 'marketing/campaigns': {
      const channels = r.strings('channels', { required: true, minItems: 1, maxItems: 5, unique: true, max: 32 }) ?? [];
      if (channels.some((c) => !GROWTH_CAPABILITIES.includes(c as Capability))) {
        r.errors.push('channels are growth capabilities (promotion, facebook_post, ads_*)');
      }
      return result({
        ref: r.string('ref', { required: true, pattern: CAMPAIGN_REF }) as string,
        name: r.string('name', { required: true }) as string,
        objective: r.oneOf('objective', ['sales', 'traffic', 'awareness', 'clearance'] as const, {
          required: true,
        }) as CampaignBody['objective'],
        channels: channels as Capability[],
        thread_id: r.string('thread_id', { max: 64 }),
        starts_at: r.dateTime('starts_at'),
        duration_days: r.number('duration_days', { required: true, min: 1, max: 90, integer: true }) as number,
        budget_vnd: r.number('budget_vnd', { min: 0, max: 1_000_000_000, integer: true }),
      });
    }
    case 'marketing/posts':
      return result({
        ref: r.string('ref', { required: true, max: 64, pattern: REF }) as string,
        campaign_ref: r.string('campaign_ref', { max: 64 }),
        message: r.string('message', { required: true, max: 5000 }) as string,
        link_path: r.string('link_path', { max: 500, pattern: LINK_PATH }),
        sku: r.string('sku'),
        asset_id: r.number('asset_id', { min: 1, integer: true }),
        scheduled_at: r.dateTime('scheduled_at'),
      });
    case 'marketing/ads': {
      const body: AdBody = {
        ref: r.string('ref', { required: true, max: 64, pattern: REF }) as string,
        campaign_ref: r.string('campaign_ref', { required: true, max: 64 }) as string,
        platform: r.oneOf('platform', AD_PLATFORMS, { required: true }) as AdPlatformName,
        objective: r.oneOf('objective', ['traffic', 'conversions'] as const),
        daily_budget_vnd: r.number('daily_budget_vnd', {
          required: true,
          min: 10_000,
          max: 1_000_000_000,
          integer: true,
        }) as number,
        duration_days: r.number('duration_days', { required: true, min: 1, max: 30, integer: true }) as number,
        starts_at: r.dateTime('starts_at'),
        link_path: r.string('link_path', { required: true, max: 500, pattern: LINK_PATH }) as string,
        headline: r.string('headline', { max: 40 }),
        primary_text: r.string('primary_text', { max: 2000 }),
        headlines: r.strings('headlines', { maxItems: 15, max: 30 }),
        descriptions: r.strings('descriptions', { maxItems: 4, max: 90 }),
        keywords: r.strings('keywords', { maxItems: 50, max: 80 }),
        ad_text: r.string('ad_text', { max: 100 }),
        sku: r.string('sku'),
        asset_id: r.number('asset_id', { min: 1, integer: true }),
      };
      if (body.platform === 'meta' && !(body.headline && body.primary_text && (body.sku || body.asset_id))) {
        r.errors.push('a Meta ad needs headline, primary_text and an image (sku or asset_id)');
      }
      if (
        body.platform === 'google' &&
        ((body.headlines?.length ?? 0) < 3 || (body.descriptions?.length ?? 0) < 2 || !body.keywords?.length)
      ) {
        r.errors.push('a Google Search ad needs 3-15 headlines, 2-4 descriptions and keywords');
      }
      if (body.platform === 'tiktok' && !(body.ad_text && body.asset_id)) {
        r.errors.push('a TikTok ad needs ad_text and a video (asset_id)');
      }
      return result(body);
    }
    case 'marketing/ads/{ref}/activate':
      return result({});
    case 'marketing/ads/{ref}/budget':
      return result({
        daily_budget_vnd: r.number('daily_budget_vnd', {
          required: true,
          min: 10_000,
          max: 1_000_000_000,
          integer: true,
        }) as number,
      });
    case 'marketing/ads/{ref}/optimization':
      return result({
        objective: r.oneOf('objective', ['traffic', 'conversions'] as const, {
          required: true,
        }) as OptimizationBody['objective'],
      });
  }
};

// ------------------------------------------------------------------ state

export interface ProductState {
  sku: string;
  category: string;
  price_vnd: number;
  cost_vnd: number;
  created_at: Date;
  last_received_at: Date | null;
}
export interface DiscountState {
  sku: string;
  percent: number;
  source: 'admin' | 'agent';
  action: string;
  starts_at: Date;
  ends_at: Date;
  revoked: boolean;
  campaign_ref?: string | null;
}
export interface CouponState {
  code: string;
  percent: number;
  source: 'admin' | 'agent';
  usable: boolean;
  campaign_ref?: string | null;
}
export interface CampaignState {
  ref: string;
  budget_vnd: number;
  status: string;
}
export interface AdState {
  ref: string;
  campaign_ref: string | null;
  platform: AdPlatformName;
  status: string;
  daily_budget_vnd: number;
  total_budget_vnd: number;
  ends_at: Date;
}
export interface PostState {
  ref: string;
  at: Date;
}
export interface AssetState {
  id: number;
  kind: 'image' | 'video';
}
export interface BudgetState {
  cap_vnd: number;
  reserved_vnd: number;
  spent_vnd: number;
}
export interface ShopState {
  now: Date;
  settings: AgentSettings;
  products: ProductState[];
  discounts: DiscountState[];
  coupons: CouponState[];
  campaigns: CampaignState[];
  ads: AdState[];
  posts: PostState[];
  assets: AssetState[];
  budget: BudgetState;
  measured_platforms: string[];
}

export const remainingVnd = (budget: BudgetState) => budget.cap_vnd - Math.max(budget.reserved_vnd, budget.spent_vnd);

// ------------------------------------------------------------------ verdict

export interface Verdict {
  status: 200 | 400 | 403 | 404 | 409 | 422;
  code?: string;
  reason?: string;
  detail: string;
  writeClass: WriteClass;
  capabilities: Capability[];
  approval?: ApprovalMode;
  replaces: string[]; // discount actions a `replace_existing` discount ends
  body?: AgentBody;
}

const refuse = (status: Verdict['status'], code: string, detail: string, reason?: string): Verdict => ({
  status,
  code,
  reason,
  detail,
  writeClass: 'shop_change',
  capabilities: [],
  replaces: [],
});
const ok = (detail: string, replaces: string[] = []): Verdict => ({
  status: 200,
  detail,
  writeClass: 'shop_change',
  capabilities: [],
  replaces,
});

export const mentionsPrice = (text: string) => PRICE_CLAIM.test(text);

export const combinedReduction = (...percents: number[]) =>
  1 - percents.reduce((remaining, percent) => remaining * (1 - percent / 100), 1);

export const campaignKind = (channels: string[]): string => {
  const kinds = new Set(
    channels.map((c) => (c === 'promotion' ? 'promotion' : c === 'facebook_post' ? 'content' : 'ads')),
  );
  return kinds.size === 1 ? [...kinds][0] : 'mixed';
};

// The day in Vietnam (UTC+7), as YYYY-MM-DD.
export const vnDate = (instant: Date) => new Date(instant.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

const daysUntil = (start: Date, end: Date) => Math.max(1, Math.ceil((end.getTime() - start.getTime()) / DAY_MS));

// A start in the past (a late approval) or no start means now: the approved body never has to change.
export const startOf = (startsAt: Date | null | undefined, now: Date) =>
  startsAt && startsAt.getTime() > now.getTime() ? startsAt : now;

const runningDiscounts = (state: ShopState) =>
  state.discounts.filter(
    (d) => !d.revoked && d.starts_at.getTime() <= state.now.getTime() && state.now.getTime() < d.ends_at.getTime(),
  );

// ------------------------------------------------------------------ approval

const modeProblem = (capabilities: Capability[], settings: AgentSettings): AutonomyMode | null => {
  const modes = new Set(capabilities.map((c) => settings.autonomy[c] ?? 'ask'));
  for (const mode of ['off', 'shadow', 'ask'] as const) if (modes.has(mode)) return mode;
  return null;
};

const lowAd = (platform: string, daily: number, total: number, days: number, state: ShopState) =>
  daily <= LOW_AD_DAILY_VND &&
  total <= LOW_AD_TOTAL_VND &&
  days <= LOW_AD_DAYS &&
  state.measured_platforms.includes(platform); // a platform's first campaign is always a person's call

const extraReservation = (ad: AdState, daily: number, now: Date) =>
  Math.max(0, daily - ad.daily_budget_vnd) * daysUntil(now, ad.ends_at);

export const withinLowCaps = (route: AgentRoute, body: AgentBody, state: ShopState, ad?: AdState): boolean => {
  switch (route) {
    case 'pricing/discounts': {
      const b = body as DiscountBody;
      return (
        b.skus !== undefined &&
        b.skus.length <= LOW_SKU_COUNT &&
        b.percent <= LOW_DISCOUNT_PCT &&
        b.duration_days <= LOW_DISCOUNT_DAYS
      );
    }
    case 'promotions/coupons': {
      const b = body as CouponBody;
      return b.percent <= LOW_COUPON_PCT && b.duration_days <= LOW_COUPON_DAYS;
    }
    case 'marketing/campaigns':
      return ((body as CampaignBody).budget_vnd ?? 0) <= LOW_CAMPAIGN_BUDGET_VND;
    case 'marketing/posts':
      return !mentionsPrice((body as PostBody).message);
    case 'marketing/ads': {
      const b = body as AdBody;
      return lowAd(b.platform, b.daily_budget_vnd, b.daily_budget_vnd * b.duration_days, b.duration_days, state);
    }
    case 'channels/switch':
      return (body as ChannelBody).skus.length <= LOW_SKU_COUNT;
    case 'marketing/ads/{ref}/activate':
      return (
        !!ad &&
        lowAd(
          ad.platform,
          ad.daily_budget_vnd,
          ad.total_budget_vnd,
          Math.ceil(ad.total_budget_vnd / ad.daily_budget_vnd),
          state,
        )
      );
    case 'marketing/ads/{ref}/budget': {
      if (!ad) return false;
      const daily = (body as BudgetBody).daily_budget_vnd;
      return lowAd(ad.platform, daily, ad.total_budget_vnd + extraReservation(ad, daily, state.now), 0, state);
    }
    case 'marketing/ads/{ref}/optimization':
      return false; // a change of bidding is medium risk: always a person
    default:
      return true; // inventory adjustments, tasks, checklists
  }
};

// ------------------------------------------------------------------ evaluate

// What the web answers for this request (see the header). `hasGrant`: a verified approval grant covers it.
export const evaluate = (
  route: AgentRoute,
  path: Record<string, string>,
  raw: Raw,
  state: ShopState,
  hasGrant: boolean,
): Verdict => {
  const parsed = parseBody(route, raw);
  if (!parsed.body) return refuse(400, 'invalid_request', parsed.errors.join('; '));
  const body = parsed.body;

  let ad: AdState | undefined;
  if (route.startsWith('marketing/ads/{ref}')) {
    ad = state.ads.find((item) => item.ref === path.ref);
    if (!ad) return refuse(404, 'not_found', `no ad ${path.ref}`);
  }
  let writeClass: WriteClass = PROTECTIVE_ROUTES.includes(route) ? 'protective' : 'shop_change';
  if (route === 'marketing/ads/{ref}/budget' && ad && (body as BudgetBody).daily_budget_vnd <= ad.daily_budget_vnd) {
    writeClass = 'protective'; // lowering a budget
  }
  const capabilities: Capability[] =
    route === 'marketing/ads'
      ? [AD_CAPABILITY[(body as AdBody).platform]]
      : route === 'marketing/campaigns'
        ? (body as CampaignBody).channels
        : ad
          ? [AD_CAPABILITY[ad.platform]]
          : [FIXED_CAPABILITY[route] as Capability];

  let approval: ApprovalMode;
  if (writeClass === 'shop_change') {
    if (!state.settings['growth.enabled']) {
      return refuse(403, 'agent_disabled', 'the owner switched the agent off (growth.enabled)');
    }
    if (hasGrant) {
      approval = 'grant';
    } else {
      const mode = modeProblem(capabilities, state.settings);
      if (mode) return refuse(403, 'approval_required', `no approval grant and a capability is in ${mode}`, mode);
      if (!withinLowCaps(route, body, state, ad)) {
        return refuse(403, 'approval_required', 'no approval grant and above the low-risk caps', 'above_low_caps');
      }
      approval = 'auto_low';
    }
  } else {
    approval = 'protective';
  }

  const verdict = check(route, path, body, state, ad, hasGrant);
  if (verdict.status !== 200) return verdict;
  return { ...verdict, writeClass, capabilities, approval, body };
};

const check = (
  route: AgentRoute,
  path: Record<string, string>,
  body: AgentBody,
  state: ShopState,
  ad: AdState | undefined,
  hasGrant: boolean,
): Verdict => {
  switch (route) {
    case 'pricing/discounts':
      return checkDiscount(body as DiscountBody, state, hasGrant);
    case 'promotions/coupons':
      return checkCoupon(body as CouponBody, state, hasGrant);
    case 'marketing/campaigns':
      return checkCampaign(body as CampaignBody, state);
    case 'marketing/posts':
      return checkPost(body as PostBody, state);
    case 'marketing/ads':
      return checkAd(body as AdBody, state);
    case 'promotions/{ref}/end':
      return checkEnd(path.ref, state);
    case 'marketing/ads/{ref}/activate':
    case 'marketing/ads/{ref}/pause':
    case 'marketing/ads/{ref}/budget':
    case 'marketing/ads/{ref}/optimization':
      return checkExistingAd(route, body, ad as AdState, state);
    case 'channels/switch':
    case 'inventory/adjustments': {
      const skus = route === 'channels/switch' ? (body as ChannelBody).skus : [(body as InventoryBody).sku];
      const missing = skus.filter((sku) => !state.products.some((p) => p.sku === sku));
      return missing.length > 0 ? refuse(404, 'not_found', `unknown SKU(s): ${missing.join(', ')}`) : ok('');
    }
    default:
      return ok('');
  }
};

// ------------------------------------------------------------------ promotions

const runningAgentPromotions = (state: ShopState, excluding: Set<string>) => {
  const actions = new Set(
    runningDiscounts(state)
      .filter((d) => d.source === 'agent' && !excluding.has(d.action))
      .map((d) => d.action),
  );
  return actions.size + state.coupons.filter((c) => c.source === 'agent' && c.usable).length;
};

// Every product keeps the margin floor after the agent's stacked promotions, and never sells below cost.
const marginProblem = (
  products: ProductState[],
  percents: Map<string, number[]>,
  state: ShopState,
  hasGrant: boolean,
): Verdict | null => {
  const floor = state.settings['growth.goal'].margin_floor_pct / 100;
  const deadBefore = state.now.getTime() - DEAD_STOCK_DAYS * DAY_MS;
  for (const product of products) {
    const price = product.price_vnd * (1 - combinedReduction(...(percents.get(product.sku) ?? [])));
    if (price < product.cost_vnd - EPSILON) {
      return refuse(422, 'limit_exceeded', `${product.sku} would sell below cost`, 'below_cost');
    }
    const margin = price > 0 ? (price - product.cost_vnd) / price : -1;
    const deadStock = product.last_received_at !== null && product.last_received_at.getTime() <= deadBefore;
    if (margin < floor - EPSILON && !(hasGrant && deadStock)) {
      return refuse(
        422,
        'limit_exceeded',
        `${product.sku}: gross margin ${(margin * 100).toFixed(1)}% is below the floor of ${floor * 100}%`,
        'margin_floor',
      );
    }
  }
  return null;
};

const checkDiscount = (body: DiscountBody, state: ShopState, hasGrant: boolean): Verdict => {
  let targets: ProductState[];
  if (body.category !== undefined) {
    targets = state.products.filter((p) => p.category === body.category);
    if (targets.length === 0) return refuse(404, 'not_found', `no product in category ${body.category}`);
  } else {
    const missing = (body.skus ?? []).filter((sku) => !state.products.some((p) => p.sku === sku));
    if (missing.length > 0) return refuse(404, 'not_found', `unknown SKU(s): ${missing.join(', ')}`);
    targets = (body.skus ?? []).map((sku) => state.products.find((p) => p.sku === sku) as ProductState);
  }
  const now = state.now.getTime();
  const start = startOf(body.starts_at, state.now).getTime();
  const end = start + body.duration_days * DAY_MS;
  const fresh = targets.filter((p) => p.created_at.getTime() > now - NEW_ARRIVAL_DAYS * DAY_MS).map((p) => p.sku);
  if (fresh.length > 0) {
    return refuse(422, 'limit_exceeded', `new arrivals are not discounted: ${fresh.join(', ')}`, 'new_arrival');
  }

  const skus = new Set(targets.map((p) => p.sku));
  const overlapping = state.discounts.filter(
    (d) => skus.has(d.sku) && !d.revoked && d.ends_at.getTime() > start && d.starts_at.getTime() < end,
  );
  if (overlapping.length > 0 && !(body.replace_existing && overlapping.every((d) => d.source === 'agent'))) {
    const taken = [...new Set(overlapping.map((d) => d.sku))].sort();
    return refuse(409, 'overlap', `already discounted: ${taken.join(', ')}`, 'discount_overlap');
  }
  const replaced = new Set(overlapping.map((d) => d.action));

  const recent = now - PROMO_FREQUENCY_DAYS * DAY_MS;
  const repeated = [
    ...new Set(
      state.discounts
        .filter(
          (d) =>
            skus.has(d.sku) &&
            d.source === 'agent' &&
            !replaced.has(d.action) &&
            d.starts_at.getTime() > recent &&
            d.starts_at.getTime() <= now,
        )
        .map((d) => d.sku),
    ),
  ].sort();
  if (repeated.length > 0) {
    return refuse(
      422,
      'limit_exceeded',
      `discounted by the agent in the last 30 days: ${repeated.join(', ')}`,
      'frequency',
    );
  }
  if (runningAgentPromotions(state, replaced) >= MAX_AGENT_PROMOTIONS) {
    return refuse(422, 'limit_exceeded', `${MAX_AGENT_PROMOTIONS} agent promotions already run`, 'max_promotions');
  }

  const usable = state.coupons.filter((c) => c.usable);
  const largestCoupon = Math.max(0, ...usable.map((c) => c.percent));
  if (combinedReduction(body.percent, largestCoupon) > LEGAL_MAX_COMBINED + EPSILON) {
    return refuse(
      422,
      'limit_exceeded',
      `${body.percent}% with the ${largestCoupon}% coupon takes more than 50% off the list price`,
      'legal_max',
    );
  }
  const agentCoupon = Math.max(0, ...usable.filter((c) => c.source === 'agent').map((c) => c.percent));
  const stacked = new Map(targets.map((p) => [p.sku, [body.percent, agentCoupon]]));
  const problem = marginProblem(targets, stacked, state, hasGrant);
  if (problem) return problem;
  return ok(`${body.percent}% off ${targets.length} product(s) for ${body.duration_days} day(s)`, [...replaced].sort());
};

const checkCoupon = (body: CouponBody, state: ShopState, hasGrant: boolean): Verdict => {
  if (state.coupons.some((c) => c.code === body.code)) {
    return refuse(409, 'overlap', `coupon ${body.code} exists`, 'ref_taken');
  }
  if (runningAgentPromotions(state, new Set()) >= MAX_AGENT_PROMOTIONS) {
    return refuse(422, 'limit_exceeded', `${MAX_AGENT_PROMOTIONS} agent promotions already run`, 'max_promotions');
  }
  const running = runningDiscounts(state);
  const largestDiscount = Math.max(0, ...running.map((d) => d.percent));
  if (combinedReduction(largestDiscount, body.percent) > LEGAL_MAX_COMBINED + EPSILON) {
    return refuse(
      422,
      'limit_exceeded',
      `${body.percent}% with the ${largestDiscount}% discount takes more than 50% off the list price`,
      'legal_max',
    );
  }
  const agentDiscount = new Map<string, number>();
  for (const d of running) {
    if (d.source === 'agent') agentDiscount.set(d.sku, Math.max(agentDiscount.get(d.sku) ?? 0, d.percent));
  }
  const stacked = new Map(state.products.map((p) => [p.sku, [agentDiscount.get(p.sku) ?? 0, body.percent]]));
  const problem = marginProblem(state.products, stacked, state, hasGrant);
  if (problem) return problem;
  return ok(`coupon ${body.code}: ${body.percent}% for ${body.duration_days} day(s)`);
};

const checkEnd = (ref: string, state: ShopState): Verdict => {
  const coupon = state.coupons.find((c) => c.code === ref && c.source === 'agent');
  const campaign = state.campaigns.find((c) => c.ref === ref);
  if (!coupon && !campaign) return refuse(404, 'not_found', `no agent coupon or campaign ${ref}`);
  return ok(`ended the agent's promotions of ${ref}`);
};

// ------------------------------------------------------------------ marketing

const checkCampaign = (body: CampaignBody, state: ShopState): Verdict => {
  if (state.campaigns.some((c) => c.ref === body.ref)) {
    return refuse(409, 'overlap', `campaign ${body.ref} exists`, 'ref_taken');
  }
  const cap = state.settings['growth.caps'].per_campaign_vnd;
  if ((body.budget_vnd ?? 0) > cap) {
    return refuse(422, 'limit_exceeded', `budget above the per-campaign cap of ${cap} VND`, 'per_campaign_cap');
  }
  return ok(`campaign ${body.ref}`);
};

const imageProblem = (
  sku: string | null | undefined,
  assetId: number | null | undefined,
  state: ShopState,
  kind: 'image' | 'video',
): Verdict | null => {
  if (sku && !state.products.some((p) => p.sku === sku)) return refuse(404, 'not_found', `unknown SKU ${sku}`);
  if (assetId) {
    const asset = state.assets.find((a) => a.id === assetId);
    if (!asset) return refuse(404, 'not_found', `no marketing asset ${assetId}`);
    if (asset.kind !== kind) {
      const reason = kind === 'video' ? 'video_required' : 'asset_kind';
      return refuse(422, 'limit_exceeded', `asset ${assetId} is a ${asset.kind}, not a ${kind}`, reason);
    }
  }
  return null;
};

// When a post goes out: its schedule if at least 10 minutes ahead, otherwise now.
export const publishTime = (scheduledAt: Date | null | undefined, now: Date) =>
  scheduledAt && scheduledAt.getTime() >= now.getTime() + SCHEDULE_MIN_MS ? scheduledAt : now;

const checkPost = (body: PostBody, state: ShopState): Verdict => {
  if (state.posts.some((p) => p.ref === body.ref))
    return refuse(409, 'overlap', `post ${body.ref} exists`, 'ref_taken');
  if (body.campaign_ref && !state.campaigns.some((c) => c.ref === body.campaign_ref)) {
    return refuse(404, 'not_found', `no campaign ${body.campaign_ref}`);
  }
  const problem = imageProblem(body.sku, body.asset_id, state, 'image');
  if (problem) return problem;
  const at = publishTime(body.scheduled_at, state.now);
  if (at.getTime() > state.now.getTime() + SCHEDULE_MAX_MS) {
    return refuse(422, 'limit_exceeded', 'a post is scheduled at most 30 days ahead', 'schedule');
  }
  if (state.posts.filter((p) => vnDate(p.at) === vnDate(at)).length >= POSTS_PER_DAY) {
    return refuse(422, 'limit_exceeded', `already ${POSTS_PER_DAY} posts that day`, 'frequency');
  }
  if (state.posts.some((p) => Math.abs(p.at.getTime() - at.getTime()) < POST_SPACING_MS)) {
    return refuse(422, 'limit_exceeded', 'posts are at least 4 hours apart', 'frequency');
  }
  return ok(`post ${body.ref} at ${at.toISOString()}`);
};

const campaignRoom = (campaign: CampaignState, state: ShopState, excluding?: string) => {
  const cap = Math.min(campaign.budget_vnd, state.settings['growth.caps'].per_campaign_vnd);
  const committed = state.ads
    .filter((a) => a.campaign_ref === campaign.ref && a.status !== 'reverted' && a.ref !== excluding)
    .reduce((sum, a) => sum + a.total_budget_vnd, 0);
  return cap - committed;
};

const checkAd = (body: AdBody, state: ShopState): Verdict => {
  if (state.ads.some((a) => a.ref === body.ref)) return refuse(409, 'overlap', `ad ${body.ref} exists`, 'ref_taken');
  const campaign = state.campaigns.find((c) => c.ref === body.campaign_ref);
  if (!campaign || !['draft', 'active'].includes(campaign.status)) {
    return refuse(404, 'not_found', `no open campaign ${body.campaign_ref}`);
  }
  const problem = imageProblem(body.sku, body.asset_id, state, body.platform === 'tiktok' ? 'video' : 'image');
  if (problem) return problem;
  const perDay = state.settings['growth.caps'].per_day_vnd;
  if (body.daily_budget_vnd > perDay) {
    return refuse(422, 'limit_exceeded', `daily budget above the per-day cap of ${perDay} VND`, 'per_day_cap');
  }
  const total = body.daily_budget_vnd * body.duration_days;
  if (total > campaignRoom(campaign, state)) {
    return refuse(
      422,
      'limit_exceeded',
      "the campaign's ads would exceed its budget or the per-campaign cap",
      'per_campaign_cap',
    );
  }
  const remaining = remainingVnd(state.budget);
  if (total > remaining) {
    return refuse(409, 'budget_exceeded', `${remaining} VND left in this month's ad budget`, 'monthly_cap');
  }
  return ok(`${body.platform} ad ${body.ref}, ${total} VND reserved`);
};

const checkExistingAd = (route: AgentRoute, body: AgentBody, ad: AdState, state: ShopState): Verdict => {
  const closed = ['ended', 'reverted'].includes(ad.status) || ad.ends_at.getTime() <= state.now.getTime();
  if (route === 'marketing/ads/{ref}/pause') return ok(`ad ${ad.ref} paused`);
  if (route === 'marketing/ads/{ref}/budget') {
    const daily = (body as BudgetBody).daily_budget_vnd;
    if (daily <= ad.daily_budget_vnd) return ok(`ad ${ad.ref} daily budget ${daily} VND`);
    if (closed) return refuse(422, 'limit_exceeded', `ad ${ad.ref} has ended`, 'ad_closed');
    const perDay = state.settings['growth.caps'].per_day_vnd;
    if (daily > perDay) {
      return refuse(422, 'limit_exceeded', `daily budget above the per-day cap of ${perDay} VND`, 'per_day_cap');
    }
    const extra = extraReservation(ad, daily, state.now);
    const campaign = state.campaigns.find((c) => c.ref === ad.campaign_ref);
    if (campaign && ad.total_budget_vnd + extra > campaignRoom(campaign, state, ad.ref)) {
      return refuse(
        422,
        'limit_exceeded',
        "the campaign's ads would exceed its budget or the per-campaign cap",
        'per_campaign_cap',
      );
    }
    const remaining = remainingVnd(state.budget);
    if (extra > remaining) {
      return refuse(409, 'budget_exceeded', `${remaining} VND left in this month's ad budget`, 'monthly_cap');
    }
    return ok(`ad ${ad.ref} daily budget ${daily} VND (+${extra} VND reserved)`);
  }
  if (closed) return refuse(422, 'limit_exceeded', `ad ${ad.ref} has ended`, 'ad_closed');
  return ok(`ad ${ad.ref}`);
};

// Exposed for the state loader and the handlers.
export { extraReservation, daysUntil, DAY_MS };
