'use client';
import Api from './Api';
import type {
  MarketingCopy,
  MarketingDraft,
  MarketingDraftInput,
  MarketingOptions,
} from '@/shared/types/admin-marketing';
const ROOT = '/admin/marketing'; // Api already prefixes /api/
async function request<T>(call: () => Promise<{ data: T }>): Promise<T | undefined> {
  try {
    return (await call()).data;
  } catch {
    return undefined;
  }
}
export default class AdminMarketingApi {
  static upload = (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<MarketingOptions['assets'][number]>(() =>
      Api.post(`${ROOT}/assets/upload`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    );
  };
  static list = () => request<MarketingDraft[]>(() => Api.get(`${ROOT}/drafts`));
  static options = () => request<MarketingOptions>(() => Api.get(`${ROOT}/options`));
  static suggest = (input: MarketingDraftInput) => request<MarketingCopy>(() => Api.post(`${ROOT}/suggest`, input));
  static save = (input: MarketingDraftInput, id?: number) =>
    request<MarketingDraft>(() => Api.post(id ? `${ROOT}/drafts/${id}/save` : `${ROOT}/drafts`, input));
  static publish = (id: number) => request<MarketingDraft>(() => Api.post(`${ROOT}/drafts/${id}/publish`));
  static control = async (id: number, action: 'activate' | 'pause' | 'end') => {
    try {
      await Api.post(`${ROOT}/drafts/${id}/${action}`);
      return true;
    } catch {
      return false;
    }
  };
}
