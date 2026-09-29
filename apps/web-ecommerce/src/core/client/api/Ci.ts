'use client';

import Api from './Api';
import { ADMIN_CI_API } from './endpoint';
import type { PaginatedResult } from '@/shared/types/pagination';
import type {
  AgentTask,
  AgentTaskStatus,
  CiDecisionPayload,
  CiImprovementDetail,
  CiImprovementGroup,
  CiImprovementSummary,
  CiNotificationList,
  CiRunReport,
} from '@/shared/types/ci';

export interface AgentTaskListParams {
  status?: '' | AgentTaskStatus;
  page?: number;
  per_page?: number;
}

// CI Console: the admin proxy to the CI agent service (/api/admin/ci).
export default class CiApi {
  static async getImprovements(group: CiImprovementGroup | ''): Promise<CiImprovementSummary[] | undefined> {
    try {
      const response = await Api.get(ADMIN_CI_API.GET_IMPROVEMENTS, { params: group ? { group } : {} });
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async getImprovement(improvementId: string): Promise<CiImprovementDetail | undefined> {
    try {
      const response = await Api.get(ADMIN_CI_API.GET_IMPROVEMENT(improvementId));
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async decide(improvementId: string, payload: CiDecisionPayload): Promise<CiImprovementDetail | undefined> {
    try {
      const response = await Api.post(ADMIN_CI_API.DECIDE(improvementId), payload);
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async runNow(): Promise<CiRunReport | undefined> {
    try {
      const response = await Api.post(ADMIN_CI_API.RUN_NOW);
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async getNotifications(): Promise<CiNotificationList | undefined> {
    try {
      const response = await Api.get(ADMIN_CI_API.GET_NOTIFICATIONS);
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async markNotificationsRead(): Promise<boolean> {
    try {
      await Api.put(ADMIN_CI_API.MARK_NOTIFICATIONS_READ);
      return true;
    } catch (error) {
      return false;
    }
  }

  static async getTasks(params: AgentTaskListParams): Promise<PaginatedResult<AgentTask> | undefined> {
    try {
      const response = await Api.get(ADMIN_CI_API.GET_TASKS, { params });
      return response.data?.payload;
    } catch (error) {
      return undefined;
    }
  }

  static async updateTaskStatus(taskId: number, status: AgentTaskStatus): Promise<AgentTask | undefined> {
    try {
      const response = await Api.put(ADMIN_CI_API.UPDATE_TASK_STATUS(taskId), { status });
      return response.data;
    } catch (error) {
      return undefined;
    }
  }
}
