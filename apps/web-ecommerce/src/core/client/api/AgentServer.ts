'use client';

import { Client } from '@langchain/langgraph-sdk';
import { toast } from 'react-toastify';
import { ADMIN_AGENT_API } from './endpoint';
import type {
  AgentCase,
  CopilotThread,
  ImprovementThread,
  ImprovementValues,
  ReviewDecision,
  ReviewPayload,
} from '@/shared/types/agent';

// The Agent Server, through the web gateway (/api/admin/agent/server): the browser never holds an agent credential.
export const agentServerUrl = () => `${window.location.origin}${ADMIN_AGENT_API.SERVER}`;
const client = () => new Client({ apiUrl: agentServerUrl(), apiKey: null });

const IMPROVEMENT = 'improvement';
export const ASSISTANT = 'assistant';
const LIST_LIMIT = 100;

const report = (error: unknown, fallback: string) => {
  const message = error instanceof Error && error.message ? error.message : fallback;
  toast.error(message.includes('HTTP') ? fallback : message);
};

export type ImprovementFilter = 'reviewing' | 'active' | 'closed' | 'all';

// langgraph dev returns each thread with its state values; Aegra returns none and ignores a `values` filter
// (ADR-0013), so missing values are read from the thread's state.
const withValues = (api: Client, threads: ImprovementThread[]) =>
  Promise.all(
    threads.map(async (thread) =>
      thread.values !== undefined
        ? thread
        : { ...thread, values: (await api.threads.getState<ImprovementValues>(thread.thread_id)).values },
    ),
  );

// Agent console: improvement threads, their reviews, cases.
export default class AgentServerApi {
  static async listImprovements(filter: ImprovementFilter): Promise<ImprovementThread[] | undefined> {
    try {
      const query = {
        metadata: { graph: IMPROVEMENT },
        limit: LIST_LIMIT,
        sortBy: 'updated_at' as const,
        sortOrder: 'desc' as const,
        ...(filter === 'reviewing' ? { status: 'interrupted' as const } : {}),
        ...(filter === 'closed' ? { values: { stage: 'closed' } } : {}),
      };
      const api = client();
      const found = (await api.threads.search<ImprovementValues>(query)) as unknown as ImprovementThread[];
      const threads = await withValues(api, found);
      if (filter === 'active') {
        return threads.filter((t) => t.status !== 'interrupted' && t.values?.stage !== 'closed');
      }
      return filter === 'closed' ? threads.filter((t) => t.values?.stage === 'closed') : threads;
    } catch (error) {
      report(error, 'Chưa tải được danh sách đề xuất.');
      return undefined;
    }
  }


  static async getImprovement(
    threadId: string,
  ): Promise<{ thread: ImprovementThread; review: ReviewPayload | null } | null | undefined> {
    try {
      const api = client();
      const [thread, state] = await Promise.all([
        api.threads.get<ImprovementValues>(threadId),
        api.threads.getState<ImprovementValues>(threadId),
      ]);
      const review =
        state.tasks
          .flatMap((task) => task.interrupts ?? [])
          .map((item) => item.value as ReviewPayload)
          .find((value) => value?.type === 'proposal_review') ?? null;
      const found = thread as unknown as ImprovementThread;
      return { thread: { ...found, values: found.values ?? state.values }, review };
    } catch (error) {
      if (error instanceof Error && /404/.test(error.message)) return null;
      report(error, 'Chưa tải được đề xuất: dịch vụ AI tạm thời không trả lời.');
      return undefined;
    }
  }

  static async getHistory(threadId: string): Promise<{ stage?: string; createdAt: string; step: number }[]> {
    try {
      const history = await client().threads.getHistory<ImprovementValues>(threadId, { limit: 50 });
      return history.map((item) => ({
        stage: item.values?.stage,
        createdAt: item.created_at ?? '',
        step: Number((item.metadata as { step?: number } | undefined)?.step ?? 0),
      }));
    } catch {
      return [];
    }
  }

  // Resumes the review and streams the thread's state until the run pauses or ends (act can take a moment).
  static async decide(
    threadId: string,
    decision: ReviewDecision,
    onValues: (values: ImprovementValues) => void,
  ): Promise<boolean> {
    try {
      const stream = client().runs.stream(threadId, IMPROVEMENT, {
        command: { resume: decision },
        streamMode: 'values',
      });
      for await (const chunk of stream) {
        if (chunk.event === 'values') onValues(chunk.data as ImprovementValues);
        if (chunk.event === 'error') {
          toast.error('Agent gặp lỗi khi xử lý quyết định.');
          return false;
        }
      }
      return true;
    } catch (error) {
      report(error, 'Chưa gửi được quyết định, vui lòng thử lại.');
      return false;
    }
  }

  // "Run now": one monitor tick (detect, open threads, sweep), waited for.
  static async runMonitorNow(): Promise<boolean> {
    try {
      const api = client();
      const run = await api.runs.create(null, 'monitor');
      await api.runs.join(run.thread_id, run.run_id);
      return true;
    } catch (error) {
      report(error, 'Chưa chạy được lượt phát hiện.');
      return false;
    }
  }

  // The copilot's chats and daily briefings, newest first (the Agent Server tags each thread with its graph).
  static async listCopilotThreads(): Promise<CopilotThread[] | undefined> {
    try {
      const threads = await client().threads.search({
        metadata: { graph_id: ASSISTANT },
        limit: LIST_LIMIT,
        sortBy: 'updated_at',
        sortOrder: 'desc',
        select: ['thread_id', 'updated_at', 'metadata', 'status'],
      });
      return threads.map((thread) => ({
        threadId: thread.thread_id,
        updatedAt: thread.updated_at,
        briefing: (thread.metadata as { cron?: string } | null)?.cron === 'daily_briefing',
        waiting: thread.status === 'interrupted',
      }));
    } catch (error) {
      report(error, 'Chưa tải được các cuộc trò chuyện.');
      return undefined;
    }
  }

  static async searchCases(query: string): Promise<AgentCase[] | undefined> {
    try {
      const result = await client().store.searchItems(['cases'], { query: query || undefined, limit: 50 });
      return result.items.map((item) => {
        const value = item.value as Record<string, unknown>;
        return {
          key: item.key,
          kind: String(value.kind ?? item.namespace[1] ?? ''),
          text: String(value.text ?? ''),
          outcome: (value.outcome as string | null) ?? null,
          verdict: (value.verdict as AgentCase['verdict']) ?? null,
          strategy: (value.strategy as string | null) ?? null,
          lessons: Array.isArray(value.lessons) ? (value.lessons as string[]) : [],
          closedAt: String(value.closed_at ?? item.updatedAt ?? ''),
        };
      });
    } catch (error) {
      report(error, 'Chưa tải được thư viện tình huống.');
      return undefined;
    }
  }
}
