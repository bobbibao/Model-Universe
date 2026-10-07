import axios from 'axios';
import { createHash } from 'crypto';
import { Op } from 'sequelize';
import AgentApprovalModel from '../database/client/models/AgentApproval.Model';
import AgentSettingModel from '../database/client/models/AgentSetting.Model';
import { canonicalJson, hashAgentRequest } from '../../../shared/server/utils/AgentApiUtils';
import HttpError from '../../../shared/server/utils/HttpError';
import Logger from '../../../shared/server/utils/logger';
import { AgentRole, getStepUpMaxAgeSeconds, signAgentActorToken } from '../../../shared/server/utils/JwtUtils';
import MailService from './MailService';
import {
  ReviewAction,
  ReviewOption,
  applyEdits,
  grantClaims,
  signApprovalGrant,
} from '../../../shared/server/utils/ApprovalGrantUtils';
import { COPILOT_TOOLS, copilotRequest } from '../../../shared/server/utils/CopilotToolUtils';
import type { AuthUser } from '../../../shared/server/types/express';

// The only way from the web to the Agent Server (docs/ARCHITECTURE.md section 10): the browser's
// @langchain/langgraph-sdk client talks to /api/admin/agent/server/*, and this service forwards an allowlisted subset
// of the Agent Server API with a short-lived actor token for the signed-in admin. Resuming a review, or the copilot's
// approval of its tool calls, is rebuilt here: the approver comes from the session and approvals carry a grant signed
// over the exact bodies.

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
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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

// The copilot's pending approval: langchain's HumanInTheLoopMiddleware request, one entry per paused tool call.
interface ToolApprovalRequest {
  action_requests: { name: string; args: Json; description?: string }[];
  review_configs: { action_name: string; allowed_decisions: string[] }[];
}

interface ToolCall {
  id: string;
  name: string;
  args: Json;
}

const isToolApprovalRequest = (value: unknown): value is ToolApprovalRequest =>
  isObject(value) && Array.isArray(value.action_requests) && Array.isArray(value.review_configs);

// A copilot write call as the action its grant covers (key `{thread_id}:{tool_call_id}`); null for any other tool.
const toolAction = (threadId: string, callId: string, tool: string, args: Json): ReviewAction | null => {
  const request = copilotRequest(tool, args);
  if (!request) return null;
  const key = `${threadId}:${callId}`;
  return {
    action_id: callId,
    type: tool,
    ...request,
    idempotency_key: key,
    editable_fields: COPILOT_TOOLS[tool].editable,
  };
};

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
    if (!isAllowed(method, path)) throw HttpError.forbidden('Thao tác này không được phép qua cổng Agent.');
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
    if (payload.assistant_id === 'marketing_copy') {
      if (payload.command !== undefined || !isObject(payload.input) || !isObject(payload.input.request)) {
        throw HttpError.badRequest('Yêu cầu gợi ý nội dung không hợp lệ.');
      }
      return { assistant_id: 'marketing_copy', input: { request: payload.input.request } };
    }
    if (payload.assistant_id === 'improvement') {
      const command = payload.command;
      const keys = isObject(command) ? Object.keys(command) : [];
      if (payload.input != null || !isObject(command) || keys.length !== 1 || keys[0] !== 'resume') {
        throw HttpError.forbidden('Chỉ được trả lời đề xuất đang chờ duyệt.');
      }
      return { ...payload, command: { resume: await this.decision(user, run[1], command.resume) } };
    }
    if (payload.assistant_id === 'assistant') {
      const command = payload.command;
      if (command === undefined) {
        // A chat message. Only messages: approval grants never come from a browser.
        const input = payload.input;
        if (!isObject(input) || !Array.isArray(input.messages)) {
          throw HttpError.forbidden('Chỉ được gửi tin nhắn cho trợ lý.');
        }
        return { ...payload, input: { messages: input.messages } };
      }
      const keys = isObject(command) ? Object.keys(command) : [];
      if (payload.input != null || !isObject(command) || keys.length !== 1 || keys[0] !== 'resume') {
        throw HttpError.forbidden('Chỉ được trả lời các thao tác đang chờ duyệt.');
      }
      return { ...payload, command: await this.toolDecisions(user, run[1], command.resume) };
    }
    throw HttpError.forbidden('Thao tác này không được phép qua cổng Agent.');
  }

  private async pendingToolApproval(
    user: AuthUser,
    threadId: string,
  ): Promise<{ request: ToolApprovalRequest; calls: ToolCall[] }> {
    const state = await this.forward(user, 'GET', `/threads/${threadId}/state`);
    const data = isObject(state.data) ? state.data : {};
    const tasks = Array.isArray(data.tasks) ? (data.tasks as Json[]) : [];
    const request = tasks
      .flatMap((task) => (Array.isArray(task.interrupts) ? (task.interrupts as Json[]) : []))
      .map((item) => item.value)
      .find(isToolApprovalRequest);
    if (!request) throw HttpError.conflict('Không còn thao tác nào chờ duyệt.');
    const values = isObject(data.values) ? data.values : {};
    const messages = Array.isArray(values.messages) ? (values.messages as Json[]) : [];
    const last = [...messages].reverse().find((m) => m.type === 'ai' && Array.isArray(m.tool_calls));
    return { request, calls: (last?.tool_calls ?? []) as ToolCall[] };
  }

  // The copilot's approval of its paused tool calls (docs/ARCHITECTURE.md section 8): one decision per call, in order.
  // Approved or edited shop writes get one grant over their exact requests (pinned by
  // packages/contracts/test-vectors/copilot/write-tools.json), keyed `{thread_id}:{tool_call_id}`; the resume command
  // puts it in the thread's state, where each write tool finds its own.
  async toolDecisions(user: AuthUser, threadId: string, resume: unknown): Promise<Json> {
    const raw = isObject(resume) ? resume.decisions : undefined;
    if (!Array.isArray(raw)) throw HttpError.badRequest('Quyết định không hợp lệ.');
    const { request, calls } = await this.pendingToolApproval(user, threadId);
    if (raw.length !== request.action_requests.length) {
      throw HttpError.badRequest('Cần một quyết định cho mỗi thao tác đang chờ duyệt.');
    }
    // The middleware lists the paused calls in the order the model made them.
    let next = 0;
    const ids = request.action_requests.map((action) => {
      const index = calls.findIndex(
        (call, i) => i >= next && call.name === action.name && canonicalJson(call.args) === canonicalJson(action.args),
      );
      if (index < 0) throw HttpError.conflict('Thao tác chờ duyệt đã thay đổi, vui lòng tải lại.');
      next = index + 1;
      return calls[index].id;
    });

    const decisions: Json[] = [];
    const granted: ReviewAction[] = [];
    raw.forEach((decision, i) => {
      const action = request.action_requests[i];
      const type = isObject(decision) ? decision.type : undefined;
      const tool = COPILOT_TOOLS[action.name];
      const allowed = request.review_configs[i]?.allowed_decisions ?? [];
      // Only a shop write is edited here (its editable fields); other paused calls (a memory note) are approved or not.
      if (typeof type !== 'string' || !allowed.includes(type) || type === 'respond' || (type === 'edit' && !tool)) {
        throw HttpError.badRequest('Quyết định không hợp lệ.');
      }
      if (type === 'reject') {
        const note = (decision as Json).note;
        if (note !== undefined && (typeof note !== 'string' || note.length > MAX_NOTE_LENGTH)) {
          throw HttpError.badRequest(`Ghi chú tối đa ${MAX_NOTE_LENGTH} ký tự.`);
        }
        decisions.push(note ? { type, message: note.trim() } : { type });
        return;
      }
      let approved = toolAction(threadId, ids[i], action.name, action.args);
      if (type === 'edit') {
        const edits = (decision as Json).args;
        if (!approved || !isObject(edits)) throw HttpError.badRequest('Nội dung chỉnh sửa không hợp lệ.');
        [approved] = applyEdits([approved], edits);
        const args = tool.pathParam
          ? { ...approved.body, [tool.pathParam]: action.args[tool.pathParam] }
          : approved.body;
        decisions.push({ type, edited_action: { name: action.name, args } });
      } else {
        decisions.push({ type });
      }
      if (approved && !tool.protective) granted.push(approved);
    });

    const command: Json = { resume: { decisions } };
    if (granted.length > 0) {
      const claims = grantClaims({
        approverId: user.id,
        threadId,
        toolCallIds: granted.map((a) => a.action_id),
        actions: granted,
      });
      const grant = await signApprovalGrant(claims);
      command.update = { approval_grants: Object.fromEntries(granted.map((a) => [a.action_id, grant])) };
    }
    return command;
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
    if (actions.length === 0) return decision;
    const high = option.tier === 'high';
    if (high) await this.checkHighTier(user, threadId, option, resume, type === 'edit');
    const claims = grantClaims({ approverId: user.id, threadId, optionId: option.option_id, actions });
    decision.grant = await signApprovalGrant(claims);
    if (high) await this.notifyHighTier(user, threadId, option, claims.jti);
    return decision;
  }

  // A high-tier option (docs/GROWTH_AGENT.md section 4, decision Q8): the password re-entered in the last
  // STEP_UP_MAX_AGE_SECONDS, the exact total typed, never edited (the total shown is the total signed), and with
  // `approvals.high.two_person` a second, different admin.
  private async checkHighTier(user: AuthUser, threadId: string, option: ReviewOption, resume: Json, edited: boolean) {
    const now = Math.floor(Date.now() / 1000);
    if (!user.stepUpAt || now - user.stepUpAt > getStepUpMaxAgeSeconds()) {
      throw HttpError.forbidden('Phương án rủi ro cao: hãy nhập lại mật khẩu trước khi duyệt.');
    }
    if (edited) {
      throw HttpError.badRequest('Phương án rủi ro cao không sửa trực tiếp được; hãy phản hồi để Agent đề xuất lại.');
    }
    if (resume.confirm_total_vnd !== option.total_vnd) {
      throw HttpError.badRequest('Tổng số tiền nhập vào không khớp với phương án.');
    }
    const twoPerson = await AgentSettingModel.findByPk('approvals.high.two_person');
    if (twoPerson?.value !== true) return;
    const actionsHash = createHash('sha256')
      .update(
        JSON.stringify(
          option.actions.map((a) => [a.endpoint, a.idempotency_key, hashAgentRequest(a.endpoint, a.body)]),
        ),
      )
      .digest('hex');
    const where = { threadId, optionId: option.option_id, actionsHash };
    const others = await AgentApprovalModel.count({ where: { ...where, approverUserId: { [Op.ne]: user.id } } });
    if (others === 0) {
      await AgentApprovalModel.findOrCreate({ where: { ...where, approverUserId: user.id } });
      throw HttpError.conflict('Đã ghi nhận phê duyệt của bạn; cần thêm một quản trị viên khác duyệt phương án này.');
    }
  }

  private async notifyHighTier(user: AuthUser, threadId: string, option: ReviewOption, jti: string) {
    try {
      await new MailService().sendNotification({
        subject: 'Một phương án rủi ro cao của Agent đã được duyệt',
        message:
          `Người duyệt: ${user.email}\nLuồng: ${threadId}\nPhương án: ${option.option_id} (${option.strategy})\n` +
          `Tổng tiền: ${option.total_vnd ?? 0} VND`,
        severity: 'warning',
        dedupeKey: `approval:${jti}`,
      });
    } catch (error) {
      Logger.ERROR('Could not notify the admins of a high-tier approval:', error);
    }
  }
}
