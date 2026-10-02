'use client';

import Api from './Api';
import { ADMIN_AGENT_API } from './endpoint';
import type {
  AgentSettingKey,
  AgentSettingsPayload,
  AgentSettingValues,
  SettingEntry,
} from '@/shared/types/agent-settings';

// The agent's business controls (/admin/agent/settings).
export default class AgentSettingsApi {
  static async getSettings(): Promise<AgentSettingsPayload | undefined> {
    try {
      const response = await Api.get(ADMIN_AGENT_API.GET_SETTINGS);
      return response.data;
    } catch {
      return undefined;
    }
  }

  // `version` is the version that was edited; a concurrent change answers 409 (shown as a toast).
  static async updateSetting<K extends AgentSettingKey>(
    key: K,
    value: AgentSettingValues[K],
    version: number,
    reason?: string,
  ): Promise<SettingEntry<K> | undefined> {
    try {
      const response = await Api.put(ADMIN_AGENT_API.UPDATE_SETTING(key), { value, version, reason });
      return response.data;
    } catch {
      return undefined;
    }
  }
}
