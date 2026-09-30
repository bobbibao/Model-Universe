'use client';

import Api from './Api';
import { ADMIN_AGENT_API } from './endpoint';
import type {
  Competitor,
  CompetitorCampaign,
  CompetitorPrice,
  MarketEvent,
  MarketSource,
} from '@/shared/types/agent-settings';

export type CompetitorInput = Omit<Competitor, 'id'>;
export type PriceInput = {
  competitor: string;
  sku: string;
  url: string;
  title: string;
  priceVnd: string;
  observedAt: string;
  watch: boolean;
};
export type CampaignInput = {
  competitorId: number;
  title: string;
  category: string;
  discountPct: string;
  startsAt: string;
  endsAt: string;
  url: string;
};

const get = async <T>(url: string): Promise<T | undefined> => {
  try {
    const response = await Api.get(url);
    return response.data;
  } catch {
    return undefined;
  }
};

const send = async <T>(call: () => Promise<{ data: T }>): Promise<T | true | undefined> => {
  try {
    const response = await call();
    return response.data ?? true;
  } catch {
    return undefined;
  }
};

// Market data for the growth agent (/admin/agent/market).
export default class MarketApi {
  static getCompetitors = () => get<Competitor[]>(ADMIN_AGENT_API.COMPETITORS);
  static createCompetitor = (input: CompetitorInput) => send(() => Api.post(ADMIN_AGENT_API.COMPETITORS, input));
  static updateCompetitor = (id: number, input: CompetitorInput) =>
    send(() => Api.put(ADMIN_AGENT_API.COMPETITOR(id), input));
  static removeCompetitor = (id: number) => send(() => Api.delete(ADMIN_AGENT_API.COMPETITOR(id)));

  static getPrices = () => get<CompetitorPrice[]>(ADMIN_AGENT_API.PRICES);
  static addPrice = (input: PriceInput) => send(() => Api.post(ADMIN_AGENT_API.PRICES, input));
  static removePrice = (id: number) => send(() => Api.delete(ADMIN_AGENT_API.PRICE(id)));
  static importPrices = (csv: string) =>
    send<{ imported: number }>(() => Api.post(ADMIN_AGENT_API.IMPORT_PRICES, { csv }));

  static getCampaigns = () => get<CompetitorCampaign[]>(ADMIN_AGENT_API.COMPETITOR_CAMPAIGNS);
  static addCampaign = (input: CampaignInput) => send(() => Api.post(ADMIN_AGENT_API.COMPETITOR_CAMPAIGNS, input));
  static removeCampaign = (id: number) => send(() => Api.delete(ADMIN_AGENT_API.COMPETITOR_CAMPAIGN(id)));

  static getEvents = () => get<MarketEvent[]>(ADMIN_AGENT_API.MARKET_EVENTS);
  static getSources = () => get<MarketSource[]>(ADMIN_AGENT_API.MARKET_SOURCES);
}
