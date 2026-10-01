// The agent's campaigns and writes as the admin console shows them (MarketingCampaignService, AgentActionService).

export type AgentAdSummary = {
  ref: string;
  platform: 'meta' | 'google' | 'tiktok';
  status: 'paused' | 'active' | 'ended' | 'reverted';
  objective: string;
  dailyBudgetVnd: number;
  totalBudgetVnd: number;
  spentVnd: number;
  endsAt: string | null;
};

export type AgentCampaign = {
  ref: string;
  name: string;
  kind: string;
  objective: string;
  status: string;
  channels: string[];
  startsAt: string | null;
  endsAt: string | null;
  budgetVnd: number;
  threadId: string | null;
  ads: AgentAdSummary[];
  posts: { ref: string; status: string; at: string | null; link: string | null }[];
  coupons: { code: string; percent: number; active: boolean }[];
  activeDiscounts: number;
};

export type AgentCampaignList = { campaigns: AgentCampaign[]; activeAds: number };

export type AgentWriteClass = 'shop_change' | 'protective' | 'ingestion';

export type AgentAuditEntry = {
  id: number;
  idempotencyKey: string;
  endpoint: string;
  responseBody: { ref: string; detail: string };
  status: 'applied' | 'reverted';
  revertedByKey: string | null;
  revertedAt: string | null;
  threadId: string | null;
  optionId: string | null;
  actionId: string | null;
  stepNo: number | null;
  writeClass: AgentWriteClass | null;
  approvalMode: string | null;
  approverUserId: number | null;
  grantJti: string | null;
  riskTier: string | null;
  policyVersion: string | null;
  modelProfile: string | null;
  traceId: string | null;
  createdAt: string;
};
