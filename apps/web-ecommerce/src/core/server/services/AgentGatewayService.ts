import axios from 'axios';
import HttpError from '../../../shared/server/utils/HttpError';
import Logger from '../../../shared/server/utils/logger';
import { AgentRole, signAgentActorToken } from '../../../shared/server/utils/JwtUtils';
import {
  ReviewOption,
  applyEdits,
  grantClaims,
  signApprovalGrant,
} from '../../../shared/server/utils/ApprovalGrantUtils';
import type { AuthUser } from '../../../shared/server/types/express';

// The only way from the web to the Agent Server (docs/ARCHITECTURE_V2.md section 10): the browser's
// @langchain/langgraph-sdk client talks to /api/admin/agent/server/*, and this service forwards an allowlisted subset
// of the Agent Server API with a short-lived actor token for the signed-in admin. Resuming a review is rebuilt here:
// the decision's approver comes from the session and approvals carry a grant signed over the exact bodies.

const DEFAULT_AGENT_SERVER_URL = 'http://localhost:2024';
const REQUEST_TIMEOUT_MS = 120000;
const MAX_NOTE_LENGTH = 1000;

export type GatewayMethod = 'GET' | 'POST';

const ID = '[A-Za-z0-9-]+';
const rule = (method: GatewayMethod, path: string) => ({ method, pattern: new RegExp(`^${path}$`) });

// Everything the console and the copilot need, nothing else (no DELETE, no PATCH, no store writes, no crons).
export const GATEWAY_RULES = [
  rule('POST', '/threads'),
  rule('POST', '/threads/search'),
  rule('POST', `/threads/${ID}/history`),
  rule('POST', `/threads/${ID}/runs`),
  rule('POST', `/threads/${ID}/runs/stream`),
  rule('POST', `/threads/${ID}/runs/wait`),
  rule('POST', `/threads/${ID}/runs/${ID}/cancel`),
  rule('POST', '/runs'),
  rule('POST', '/store/items/search'),
  rule('POST', '/assistants/search'),
  rule('GET', `/threads/${ID}`),
  rule('GET', `/threads/${ID}/state`),
  rule('GET', `/threads/${ID}/history`),
  rule('GET', `/threads/${ID}/runs/${ID}`),
  rule('GET', `/threads/${ID}/runs/${ID}/join`),
  rule('GET', `/threads/${ID}/runs/${ID}/stream`),
  rule('GET', '/store/items'),
  rule('GET', `/assistants/${ID}/schemas`),
];

export const isAllowed = (method: string, path: string): boolean =>
  GATEWAY_RULES.some((r) => r.method === method && r.pattern.test(path));

const THREAD_RUN = new RegExp(`^/threads/(${ID})/runs(/stream|/wait)?$`);
const isStream = (path: string) => /\/stream$/.test(path);

// Every ADMIN acts as `owner` at the Agent Server; a per-user role needs no change there.
export const toAgentRole = (user: AuthUser): AgentRole | null => (user.role === 'ADMIN' ? 'owner' : null);

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

export interface GatewayResponse {
  status: number;
  data: unknown;
  stream: boolean;
}

interface ReviewPayload {
  type: 'proposal_review';
  recommended_option_id?: string;
  options: ReviewOption[];
}

export default class AgentGatewayService {
  constructor(private readonly baseUrl: string = process.env.AGENT_SERVER_URL || DEFAULT_AGENT_SERVER_URL) {}

  private async headers(user: AuthUser): Promise<Record<string, string>> {
    const role = toAgentRole(user);
    if (!role) throw HttpError.forbidden();
    return { Authorization: `Bearer ${await signAgentActorToken(user.id, role)}` };
  }

  async forward(
    user: AuthUser,
    method: string,
    path: string,
    options: { query?: Record<string, unknown>; body?: unknown; signal?: AbortSignal } = {},
  ): Promise<GatewayResponse> {
    if (!isAllowed(method, path)) throw HttpError.forbidden('Thao tác này không được phép qua cổng tác tử.');
    const headers = await this.headers(user);
    const data = method === 'POST' ? await this.prepare(user, path, options.body) : undefined;
    const stream = isStream(path);
    try {
      const response = await axios.request({
        baseURL: this.baseUrl,
        url: path,
        method,
        params: options.query,
        data,
        headers,
        signal: options.signal,
        timeout: stream ? 0 : REQUEST_TIMEOUT_MS,
        responseType: stream ? 'stream' : 'json',
        validateStatus: () => true,
      });
      if (response.status === 401) {
        // The two services' AGENT_ACTOR_SECRET differ; a 401 would make the browser think its session expired.
        Logger.ERROR('The Agent Server rejected the actor token; check AGENT_ACTOR_SECRET on both services.');
        throw new HttpError(502, 'Không xác thực được với dịch vụ AI.');
      }
      return { status: response.status, data: response.data, stream: stream && response.status < 300 };
    } catch (error) {
      if (error instanceof HttpError || axios.isCancel(error)) throw error;
      Logger.ERROR('Agent Server unreachable:', (error as Error).message);
      throw new HttpError(503, 'Dịch vụ AI hiện không khả dụng, vui lòng thử lại sau.');
    }
  }

  // Checks a write before it leaves the web, and rebuilds review decisions.
  async prepare(user: AuthUser, path: string, body: unknown): Promise<Json> {
    const payload: Json = isObject(body) ? { ...body } : {};
    if (path === '/runs') {
      // "Run now": a stateless run of the monitor only.
      if (payload.assistant_id !== 'monitor' || payload.command !== undefined) {
        throw HttpError.forbidden('Chỉ được chạy lượt phát hiện.');
      }
      return { ...payload, input: {} };
    }
    if (path === '/threads') {
      delete payload.thread_id; // thread ids are chosen by the Agent Server or the monitor, never by a browser
      delete payload.if_exists;
      return payload;
    }
    const run = THREAD_RUN.exec(path);
    if (!run) return payload;
    if (payload.assistant_id === 'improvement') {
      const command = payload.command;
      const keys = isObject(command) ? Object.keys(command) : [];
      if (payload.input != null || !isObject(command) || keys.length !== 1 || keys[0] !== 'resume') {
        throw HttpError.forbidden('Chỉ được trả lời đề xuất đang chờ duyệt.');
      }
      return { ...payload, command: { resume: await this.decision(user, run[1], command.resume) } };
    }
    if (payload.assistant_id === 'assistant' && payload.command === undefined) {
      return payload; // the copilot's chat input (its approvals arrive in Phase 8)
    }
    throw HttpError.forbidden('Thao tác này không được phép qua cổng tác tử.');
  }

  private async pendingReview(user: AuthUser, threadId: string): Promise<ReviewPayload> {
    const state = await this.forward(user, 'GET', `/threads/${threadId}/state`);
    const tasks = isObject(state.data) && Array.isArray(state.data.tasks) ? (state.data.tasks as Json[]) : [];
    const pending = tasks
      .flatMap((task) => (Array.isArray(task.interrupts) ? (task.interrupts as Json[]) : []))
      .map((item) => item.value)
      .find((value): value is ReviewPayload => isObject(value) && value.type === 'proposal_review');
    if (!pending) throw HttpError.conflict('Đề xuất này không còn chờ duyệt.');
    return pending;
  }

  // The resume value the agent receives: type, option, edits and note from the admin; approver and grant from here.
  async decision(user: AuthUser, threadId: string, resume: unknown): Promise<Json> {
    if (!isObject(resume)) throw HttpError.badRequest('Quyết định không hợp lệ.');
    const type = resume.type;
    if (type !== 'approve' && type !== 'edit' && type !== 'reject' && type !== 'respond') {
      throw HttpError.badRequest('Quyết định không hợp lệ.');
    }
    const decision: Json = { type, approver: String(user.id) };
    if (resume.note !== undefined) {
      if (typeof resume.note !== 'string' || resume.note.length > MAX_NOTE_LENGTH) {
        throw HttpError.badRequest(`Ghi chú tối đa ${MAX_NOTE_LENGTH} ký tự.`);
      }
      decision.note = resume.note.trim();
    }
    if (type === 'reject' || type === 'respond') return decision;

    const review = await this.pendingReview(user, threadId);
    const optionId = typeof resume.option_id === 'string' ? resume.option_id : review.recommended_option_id;
    const option = review.options.find((item) => item.option_id === optionId);
    if (!option) throw HttpError.badRequest('Phương án không tồn tại.');
    const args = type === 'edit' ? resume.args : {};
    if (!isObject(args)) throw HttpError.badRequest('Nội dung chỉnh sửa không hợp lệ.');
    const actions = type === 'edit' ? applyEdits(option.actions, args) : option.actions;
    Object.assign(decision, { option_id: option.option_id, args });
    if (actions.length > 0) {
      const claims = grantClaims({ approverId: user.id, threadId, optionId: option.option_id, actions });
      decision.grant = await signApprovalGrant(claims);
    }
    return decision;
  }
}
