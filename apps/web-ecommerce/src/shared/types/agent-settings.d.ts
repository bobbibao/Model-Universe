// The agent settings and market data as the admin console receives them. The API client camel-cases every key, so
// the stored snake_case values (AgentSettingDefinitions.ts) arrive camelCase here and are sent back camelCase.

export type AutonomyMode = 'off' | 'shadow' | 'ask' | 'auto_low';
export type CapabilityKey =
  'promotion' | 'facebookPost' | 'adsMeta' | 'adsGoogle' | 'adsTiktok' | 'inventory' | 'opsTasks';

export type GrowthGoal = { revenueTargetVnd: number | 'auto'; marginFloorPct: number; maxSpendRatioPct: number };
export type GrowthCaps = { monthlyAdCapVnd: number | 'auto'; perCampaignVnd: number; perDayVnd: number };
export type TrendKeyword = { keyword: string; category: string | null };

export type AgentSettingValues = {
  'growth.enabled': boolean;
  'growth.goal': GrowthGoal;
  'growth.caps': GrowthCaps;
  autonomy: Record<CapabilityKey, AutonomyMode>;
  'brand.approved': boolean;
  'approvals.high.two_person': boolean;
  'market.trend_keywords': TrendKeyword[];
};
export type AgentSettingKey = keyof AgentSettingValues;

export type SettingEntry<K extends AgentSettingKey = AgentSettingKey> = {
  key: K;
  value: AgentSettingValues[K];
  version: number;
  updatedAt: string | null;
};

export type GrowthTargets = {
  month: string;
  trailingMonthlyRevenueVnd: number | null;
  revenueTargetVnd: number | null;
  revenueTargetSource: 'owner' | 'auto_last_year' | 'auto_trailing_3m' | 'none';
  monthlyAdCapVnd: number;
  monthlyAdCapSource: 'owner' | 'auto' | 'none';
};

export type SettingAudit = {
  id: number;
  key: AgentSettingKey;
  version: number;
  changedBy: number | null;
  reason: string | null;
  createdAt: string;
};

export type AgentSettingsPayload = {
  settings: SettingEntry[];
  targets: GrowthTargets | null;
  audit: SettingAudit[];
};

export type Competitor = {
  id: number;
  name: string;
  website: string | null;
  notes: string | null;
  isActive: boolean;
};

export type CompetitorPrice = {
  id: number;
  competitorId: number;
  url: string | null;
  watch: boolean;
  source: 'manual' | 'csv' | 'scraper' | 'fixture';
  title: string | null;
  priceVnd: number;
  observedAt: string;
  confidence: number;
  competitor?: { id: number; name: string };
  ourProduct?: { id: number; sku: string; name: string; price: number } | null;
};

export type CompetitorCampaign = {
  id: number;
  competitorId: number;
  title: string;
  category: string | null;
  discountPct: number | null;
  startsAt: string | null;
  endsAt: string | null;
  url: string | null;
  source: string;
  observedAt: string;
  competitor?: { id: number; name: string };
};

export type MarketEvent = {
  id: number;
  code: string;
  name: string;
  startsOn: string;
  endsOn: string;
  leadDays: number;
  categories: string[];
};

export type MarketSource = {
  name: string;
  status: 'ok' | 'degraded' | 'blocked' | 'off';
  detail: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
};
