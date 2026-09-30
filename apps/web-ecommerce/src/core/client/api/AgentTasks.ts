'use client';

import Api from './Api';
import { ADMIN_AGENT_API } from './endpoint';
import type { PaginatedResult } from '@/shared/types/pagination';
import type { AgentTask, AgentTaskStatus } from '@/shared/types/agent';

export interface AgentTaskListParams {
  status?: '' | AgentTaskStatus;
  page?: number;
  per_page?: number;
}

// Tasks the agent created for staff (Agent API POST /tasks), handled on /admin/agent/tasks.
export default class AgentTasksApi {
  static async getTasks(params: AgentTaskListParams): Promise<PaginatedResult<AgentTask> | undefined> {
    try {
      const response = await Api.get(ADMIN_AGENT_API.GET_TASKS, { params });
      return response.data?.payload;
    } catch (error) {
      return undefined;
    }
  }

  static async updateTaskStatus(taskId: number, status: AgentTaskStatus): Promise<AgentTask | undefined> {
    try {
      const response = await Api.put(ADMIN_AGENT_API.UPDATE_TASK_STATUS(taskId), { status });
      return response.data;
    } catch (error) {
      return undefined;
    }
  }
}
