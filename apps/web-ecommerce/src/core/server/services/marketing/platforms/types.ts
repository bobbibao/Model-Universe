import { AgentApiError } from '../../../../../shared/server/utils/AgentApiUtils';
import type { AdPlatformName } from '../../agent/AgentLimits';

// What the web does on the ad platforms and the Facebook Page (docs/GROWTH_AGENT.md section 3). Every platform has a
// live client and a fake with the same interface; `*_MODE=fake` (the default) uses the fake, which never calls out
// and simulates metrics from the budget, deterministically. Amounts are whole VND; each live client converts to the
// platform's unit.

export type PlatformMode = 'fake' | 'live';

export interface AdCreative {
  headline?: string | null;
  primary_text?: string | null;
  headlines?: string[];
  descriptions?: string[];
  keywords?: string[];
  ad_text?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
}

export interface NewAd {
  ref: string;
  name: string;
  objective: 'traffic' | 'conversions';
  dailyBudgetVnd: number;
  startsAt: Date;
  endsAt: Date;
  landingUrl: string; // absolute, with the utm parameters
  creative: AdCreative;
}

// An ad as the platform knows it: our ref, the platform's campaign id and the ids below it.
export interface PlatformAd {
  ref: string;
  externalId: string;
  platformData: Record<string, string>;
}

// What a fake needs to simulate metrics; a live client ignores it.
export interface AdRun extends PlatformAd {
  dailyBudgetVnd: number;
  totalBudgetVnd: number;
  activatedAt: Date | null;
  endsAt: Date;
  status: string;
}

export interface AdInsight {
  date: string; // YYYY-MM-DD in the account's time zone (Asia/Ho_Chi_Minh)
  impressions: number;
  clicks: number;
  spendVnd: number;
  conversions: number;
  conversionValueVnd: number;
}

export interface AdPlatformClient {
  readonly platform: AdPlatformName;
  readonly mode: PlatformMode;
  createPaused(ad: NewAd): Promise<{ externalId: string; platformData: Record<string, string> }>;
  activate(ad: PlatformAd): Promise<void>;
  pause(ad: PlatformAd): Promise<void>;
  setDailyBudget(ad: PlatformAd, dailyBudgetVnd: number): Promise<void>;
  // Switch what the ad optimises for. `spec` is the ad as created; a platform that cannot switch in place (Meta: a
  // campaign's objective is fixed) replaces the campaign and returns the new ids.
  setObjective(ad: PlatformAd, objective: 'traffic' | 'conversions', spec: NewAd): Promise<PlatformAd | void>;
  insights(ad: AdRun, since: string, until: string): Promise<AdInsight[]>;
}

export interface PagePost {
  message: string;
  link?: string | null;
  imageUrl?: string | null;
  scheduledAt?: Date | null; // absent: publish now
}

// A post's lifetime totals so far (the metrics sync books the change since its last reading on the day it reads).
export interface PostTotals {
  impressions: number;
  reach: number;
  engagements: number;
  clicks: number;
}

export interface FacebookPageClient {
  readonly mode: PlatformMode;
  publish(post: PagePost): Promise<{ externalId: string }>;
  remove(externalId: string): Promise<void>;
  totals(externalId: string, publishedAt: Date, now: Date): Promise<PostTotals>;
}

// A platform refused or failed (502 platform_error); `retryable` when the same request may succeed later.
export class PlatformError extends AgentApiError {
  constructor(platform: string, message: string, retryable: boolean) {
    super('platform_error', `${platform}: ${message}`, { retryable });
  }
}

// The days from `since` to `until` (YYYY-MM-DD, inclusive).
export const daysBetween = (since: string, until: string): string[] => {
  const days: string[] = [];
  for (
    let day = new Date(`${since}T00:00:00Z`);
    day <= new Date(`${until}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    days.push(day.toISOString().slice(0, 10));
  }
  return days;
};
