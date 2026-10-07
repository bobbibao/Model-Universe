export const MARKETING_CHANNELS = ['facebook', 'meta', 'google', 'tiktok'] as const;
export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];
export interface MarketingDraftInput {
  name: string;
  channel: MarketingChannel;
  objective: 'traffic' | 'conversions';
  brief: string;
  audience: string;
  tone: string;
  linkPath: string;
  sku: string;
  assetId?: number;
  scheduledAt?: string;
  startsAt?: string;
  dailyBudgetVnd: number;
  durationDays: number;
  message: string;
  headline: string;
  primaryText: string;
  headlines: string[];
  descriptions: string[];
  keywords: string[];
  adText: string;
}
export type MarketingCopy = Pick<
  MarketingDraftInput,
  'message' | 'headline' | 'primaryText' | 'headlines' | 'descriptions' | 'keywords' | 'adText'
>;
export interface MarketingDraft {
  id: number;
  ref: string;
  createdBy: number;
  status: 'draft' | 'submitted';
  input: MarketingDraftInput;
  updatedAt: string;
  campaignStatus?: string;
  adStatus?: string;
  postStatus?: string;
  externalId?: string | null;
}
export interface MarketingOptions {
  assets: { id: number; title: string; kind: 'image' | 'video'; url: string }[];
  products: { sku: string; name: string }[];
  modes: Record<MarketingChannel, 'fake' | 'live'>;
}
