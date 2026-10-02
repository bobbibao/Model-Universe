'use client';

import Api from './Api';
import { ADMIN_AGENT_API } from './endpoint';
import type { PaginatedResult } from '@/shared/types/pagination';
import type {
  AgentAuditEntry,
  AgentCampaignList,
  AgentWriteClass,
  GrowthScorecard,
} from '@/shared/types/agent-marketing';

export interface AuditParams {
  writeClass?: '' | AgentWriteClass;
  q?: string;
  page?: number;
  per_page?: number;
}

const send = async (call: () => Promise<unknown>): Promise<boolean> => {
  try {
    await call();
    return true;
  } catch {
    return false;
  }
};

// The agent's campaigns and the admins' protective controls (/admin/agent/campaigns), and the audit trail of its
// writes (/admin/agent/audit).
export default class AgentMarketingApi {
  static async getCampaigns(): Promise<AgentCampaignList | undefined> {
    try {
      const response = await Api.get(ADMIN_AGENT_API.CAMPAIGNS);
      return response.data;
    } catch {
      return undefined;
    }
  }

  static async getScorecard(): Promise<GrowthScorecard | undefined> {
    try {
      const response = await Api.get(ADMIN_AGENT_API.GROWTH);
      return response.data;
    } catch {
      return undefined;
    }
  }

  static endCampaign = (ref: string) => send(() => Api.post(ADMIN_AGENT_API.END_CAMPAIGN(ref)));
  static pauseAd = (ref: string) => send(() => Api.post(ADMIN_AGENT_API.PAUSE_AD(ref)));
  static pauseAllAds = () => send(() => Api.post(ADMIN_AGENT_API.PAUSE_ALL_ADS));

  static async getAudit(params: AuditParams): Promise<PaginatedResult<AgentAuditEntry> | undefined> {
    try {
      const response = await Api.get(ADMIN_AGENT_API.AUDIT, { params });
      return response.data?.payload;
    } catch {
      return undefined;
    }
  }
}
