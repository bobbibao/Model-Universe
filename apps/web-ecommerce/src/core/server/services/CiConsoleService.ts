import axios, { AxiosError, Method } from 'axios';
import HttpError from '../../../shared/server/utils/HttpError';
import Logger from '../../../shared/server/utils/logger';
import { CiRole, signAgentActorToken } from '../../../shared/server/utils/JwtUtils';
import { asTrimmedString } from '../../../shared/server/utils/ValidationUtils';
import type { AuthUser } from '../../../shared/server/types/express';
import type {
  CiCase,
  CiCaseOutcome,
  CiDecisionPayload,
  CiImpactItem,
  CiImprovementDetail,
  CiImprovementGroup,
  CiImprovementStatus,
  CiImprovementSummary,
  CiKpiDelta,
  CiKpiUnit,
  CiOption,
  CiParam,
  CiRunReport,
  CiVerdict,
} from '../../../shared/types/ci';

// Admin proxy to the CI agent service (packages/contracts/openapi/agent-service.yaml). Every call carries a
// short-lived actor token for the signed-in admin; browsers never talk to the agent directly.

const DEFAULT_AGENT_URL = 'http://localhost:8000';
const REQUEST_TIMEOUT_MS = 30000;
// A decision runs the next phases synchronously. With the LLM reasoner (agent REASONER=llm) a clarification
// makes two LLM calls (analysis + question); a local model measured 15-40 s per call, and the agent gives up on
// one call after OLLAMA_TIMEOUT_SECONDS (90 s) and then answers from its rules.
const DECISION_TIMEOUT_MS = 120000;
// A run detects and advances every open improvement (two LLM calls per new signal with REASONER=llm).
const RUN_TIMEOUT_MS = 300000;
const MAX_NOTE_LENGTH = 1000;
const DECISIONS: CiDecisionPayload['decision'][] = ['approve', 'reject', 'clarify'];

// Every ADMIN approves as `owner` in the agent's approval policy (decided for T-04). Changing this mapping,
// e.g. to a per-user role column, needs no change in the agent service.
export const toCiRole = (user: AuthUser): CiRole | null => (user.role === 'ADMIN' ? 'owner' : null);

// ------------------------------------------------------------------ agent payloads (snake_case)

type AgentOption = {
  option_id: string;
  strategy: string;
  title: string;
  params: Record<string, unknown>;
  est_recovery_value: number;
  est_cost: number;
  est_waste_reduction: number;
  risk: string;
};

type AgentImprovement = {
  id: string;
  status: CiImprovementStatus;
  phase: string;
  signal_kind: string;
  summary: string;
  severity: string;
  created_at: string;
  updated_at: string;
  options: AgentOption[];
  question_id: string | null;
};

type AgentImprovementDetail = AgentImprovement & {
  subject_skus: string[];
  metrics: Record<string, number>;
  finding: {
    summary: string;
    causes: { description: string; confidence: number; source: 'ai' | 'rules' }[];
    sop_refs: string[];
    similar_case_ids: string[];
    actionable: boolean;
    confidence: number;
  } | null;
  question: {
    id: string;
    prompt: string;
    context: string;
    status: 'open' | 'answered' | 'expired';
    attempt: number;
    created_at: string;
    expires_at: string;
    recommended_option_id: string | null;
  } | null;
  answers: {
    question_id: string;
    decision: 'approve' | 'reject' | 'clarify';
    answered_by: string;
    channel: string;
    answered_at: string;
    option_id: string | null;
    note: string | null;
  }[];
  history: { status: CiImprovementStatus; at: string; note: string }[];
  plan: {
    strategy: string;
    plan_hash: string;
    estimated_cost: number;
    evaluate_after_days: number;
    actions: { type: string; params: Record<string, unknown>; description: string }[];
  } | null;
  action_records: { step: number; type: string; status: string; detail: string; executed_at: string | null }[];
  measure_due_at: string | null;
  measurement: {
    verdict: string;
    summary: string;
    measured_at: string;
    deltas: AgentKpiDelta[];
  } | null;
  case_id: string | null;
};

type AgentKpiDelta = {
  name: string;
  unit: CiKpiUnit;
  baseline: number;
  current: number;
  delta_pct: number;
  improved: boolean;
  improvement_pct: number;
};

type AgentImpact = {
  improvement_id: string;
  signal_kind: string;
  signal_summary: string;
  strategy: string | null;
  auto_approved: boolean;
  measured_at: string;
  verdict: CiVerdict;
  summary: string;
  deltas: AgentKpiDelta[];
};

type AgentCase = {
  id: string;
  improvement_id: string;
  signal_kind: string;
  situation: string;
  options_considered: string[];
  decision: string;
  strategy: string | null;
  outcome_verdict: CiVerdict | null;
  kpi_summary: Record<string, number>;
  lessons: string[];
  created_at: string;
};

type AgentTickReport = {
  detected: string[];
  expired: string[];
  advanced: Record<string, string>;
  errors: Record<string, string>;
};

// ------------------------------------------------------------------ mapping

const toParams = (dict: Record<string, unknown> | null | undefined): CiParam[] =>
  Object.entries(dict || {}).map(([name, value]) => ({ name, value }));

const toOption = (option: AgentOption): CiOption => ({
  optionId: option.option_id,
  strategy: option.strategy,
  title: option.title,
  params: toParams(option.params),
  estRecoveryValue: option.est_recovery_value,
  estCost: option.est_cost,
  estWasteReduction: option.est_waste_reduction,
  risk: option.risk,
});

const toDelta = (delta: AgentKpiDelta): CiKpiDelta => ({
  name: delta.name,
  unit: delta.unit,
  baseline: delta.baseline,
  current: delta.current,
  deltaPct: delta.delta_pct,
  improved: delta.improved,
  improvementPct: delta.improvement_pct,
});

const toSummary = (imp: AgentImprovement): CiImprovementSummary => ({
  id: imp.id,
  status: imp.status,
  phase: imp.phase,
  signalKind: imp.signal_kind,
  summary: imp.summary,
  severity: imp.severity,
  createdAt: imp.created_at,
  updatedAt: imp.updated_at,
  options: imp.options.map(toOption),
  questionId: imp.question_id,
});

const toDetail = (imp: AgentImprovementDetail): CiImprovementDetail => ({
  ...toSummary(imp),
  subjectSkus: imp.subject_skus,
  metrics: toParams(imp.metrics),
  finding: imp.finding && {
    summary: imp.finding.summary,
    causes: imp.finding.causes,
    sopRefs: imp.finding.sop_refs,
    similarCaseIds: imp.finding.similar_case_ids,
    actionable: imp.finding.actionable,
    confidence: imp.finding.confidence,
  },
  question: imp.question && {
    id: imp.question.id,
    prompt: imp.question.prompt,
    context: imp.question.context,
    status: imp.question.status,
    attempt: imp.question.attempt,
    createdAt: imp.question.created_at,
    expiresAt: imp.question.expires_at,
    recommendedOptionId: imp.question.recommended_option_id,
  },
  answers: imp.answers.map((answer) => ({
    questionId: answer.question_id,
    decision: answer.decision,
    answeredBy: answer.answered_by,
    channel: answer.channel,
    answeredAt: answer.answered_at,
    optionId: answer.option_id,
    note: answer.note,
  })),
  history: imp.history,
  plan: imp.plan && {
    strategy: imp.plan.strategy,
    planHash: imp.plan.plan_hash,
    estimatedCost: imp.plan.estimated_cost,
    evaluateAfterDays: imp.plan.evaluate_after_days,
    actions: imp.plan.actions.map((action) => ({ ...action, params: toParams(action.params) })),
  },
  actionRecords: imp.action_records.map((record) => ({
    step: record.step,
    type: record.type,
    status: record.status,
    detail: record.detail,
    executedAt: record.executed_at,
  })),
  measureDueAt: imp.measure_due_at,
  measurement: imp.measurement && {
    verdict: imp.measurement.verdict,
    summary: imp.measurement.summary,
    measuredAt: imp.measurement.measured_at,
    deltas: imp.measurement.deltas.map(toDelta),
  },
  caseId: imp.case_id,
});

const toImpact = (item: AgentImpact): CiImpactItem => ({
  improvementId: item.improvement_id,
  signalKind: item.signal_kind,
  signalSummary: item.signal_summary,
  strategy: item.strategy,
  autoApproved: item.auto_approved,
  measuredAt: item.measured_at,
  verdict: item.verdict,
  summary: item.summary,
  deltas: item.deltas.map(toDelta),
});

// The agent's decision label: approved:<strategy>, approved:<strategy>:failed, rejected, expired or dismissed.
const toOutcome = (decision: string): CiCaseOutcome => {
  if (decision.startsWith('approved:')) return decision.endsWith(':failed') ? 'failed' : 'approved';
  return (['rejected', 'expired', 'dismissed'] as CiCaseOutcome[]).find((value) => value === decision) || 'dismissed';
};

const toCase = (item: AgentCase): CiCase => ({
  id: item.id,
  improvementId: item.improvement_id,
  signalKind: item.signal_kind,
  situation: item.situation,
  optionsConsidered: item.options_considered,
  decision: item.decision,
  outcome: toOutcome(item.decision),
  strategy: item.strategy,
  outcomeVerdict: item.outcome_verdict,
  kpiSummary: toParams(item.kpi_summary),
  lessons: item.lessons,
  createdAt: item.created_at,
});

const inGroup = (status: CiImprovementStatus, group: CiImprovementGroup | undefined): boolean => {
  if (group === 'pending') return status === 'awaiting_human';
  if (group === 'closed') return status === 'closed';
  if (group === 'active') return status !== 'awaiting_human' && status !== 'closed';
  return true;
};

// Validates the admin's decision and converts it to the agent's request body.
const toDecisionBody = (data: Record<string, unknown>) => {
  const decision = asTrimmedString(data.decision) as CiDecisionPayload['decision'];
  const optionId = asTrimmedString(data.optionId);
  const note = asTrimmedString(data.note);
  const overrides = (data.overrides && typeof data.overrides === 'object' ? data.overrides : {}) as Record<
    string,
    unknown
  >;
  const errors: string[] = [];
  if (!DECISIONS.includes(decision)) errors.push('Quyết định không hợp lệ.');
  if (decision === 'approve' && !optionId) errors.push('Vui lòng chọn một phương án để duyệt.');
  if (decision === 'clarify' && !note) errors.push('Vui lòng cho biết cần phân tích thêm điều gì.');
  if (note.length > MAX_NOTE_LENGTH) errors.push(`Ghi chú tối đa ${MAX_NOTE_LENGTH} ký tự.`);
  if (Object.values(overrides).some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    errors.push('Giá trị điều chỉnh phải là số.');
  }
  if (errors.length > 0) throw HttpError.badRequest('Quyết định chưa hợp lệ.', errors);
  return {
    decision,
    option_id: decision === 'approve' ? optionId : undefined,
    overrides: decision === 'approve' ? overrides : {},
    note: note || undefined,
  };
};

const agentDetail = (error: AxiosError): string => {
  const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail;
  return typeof detail === 'string' ? detail : '';
};

// Agent errors become HttpErrors with Vietnamese messages. A 401 from the agent means the two services'
// AGENT_ACTOR_SECRET differ; it must not reach the browser as 401, which the client treats as "session expired".
const toHttpError = (error: unknown): Error => {
  if (!axios.isAxiosError(error)) return error as Error;
  const status = error.response?.status;
  const detail = agentDetail(error);
  if (!status) {
    Logger.ERROR('CI agent service unreachable:', error.message);
    return new HttpError(503, 'Dịch vụ AI hiện không khả dụng, vui lòng thử lại sau.');
  }
  switch (status) {
    case 400:
    case 422:
      return HttpError.badRequest('Dịch vụ AI từ chối yêu cầu.', detail ? [detail] : undefined);
    case 401:
      Logger.ERROR('CI agent service rejected the actor token; check AGENT_ACTOR_SECRET on both services.');
      return new HttpError(502, 'Không xác thực được với dịch vụ AI.');
    case 403:
      return HttpError.forbidden('Vai trò của bạn không đủ quyền duyệt đề xuất này.');
    case 404:
      return HttpError.notFound('Không tìm thấy đề xuất cải tiến.');
    case 409:
      return HttpError.conflict('Câu hỏi này đã được trả lời hoặc đã hết hạn.');
    case 503:
      // The agent cannot read the shop (e.g. "analytics views missing"); its reason helps the operator fix it.
      Logger.ERROR('CI agent service cannot read the shop:', detail);
      return new HttpError(503, 'Dịch vụ AI chưa đọc được dữ liệu cửa hàng.', detail ? [detail] : undefined);
    default:
      Logger.ERROR(`CI agent service error ${status}:`, detail);
      return new HttpError(502, 'Dịch vụ AI gặp lỗi, vui lòng thử lại sau.');
  }
};

export default class CiConsoleService {
  private async request<T>(
    user: AuthUser,
    method: Method,
    path: string,
    options: { data?: unknown; params?: Record<string, string>; timeout?: number } = {},
  ): Promise<T> {
    const ciRole = toCiRole(user);
    if (!ciRole) throw HttpError.forbidden();
    try {
      const response = await axios.request<T>({
        baseURL: process.env.AGENT_SERVICE_URL || DEFAULT_AGENT_URL,
        url: path,
        method,
        data: options.data,
        params: options.params,
        timeout: options.timeout ?? REQUEST_TIMEOUT_MS,
        headers: { Authorization: `Bearer ${await signAgentActorToken(user.id, ciRole)}` },
      });
      return response.data;
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async listImprovements(user: AuthUser, group?: string): Promise<CiImprovementSummary[]> {
    const items = await this.request<AgentImprovement[]>(user, 'get', '/improvements');
    return items.filter((item) => inGroup(item.status, group as CiImprovementGroup | undefined)).map(toSummary);
  }

  async getImprovement(user: AuthUser, id: string): Promise<CiImprovementDetail> {
    return toDetail(await this.request<AgentImprovementDetail>(user, 'get', `/improvements/${encodeURIComponent(id)}`));
  }

  // The agent advances the improvement right away (plan, act), then the fresh detail is returned.
  async decide(user: AuthUser, id: string, data: Record<string, unknown>): Promise<CiImprovementDetail> {
    const path = `/improvements/${encodeURIComponent(id)}`;
    await this.request(user, 'post', `${path}/decision`, { data: toDecisionBody(data), timeout: DECISION_TIMEOUT_MS });
    return this.getImprovement(user, id);
  }

  async getImpact(user: AuthUser): Promise<CiImpactItem[]> {
    return (await this.request<AgentImpact[]>(user, 'get', '/kpi/impact')).map(toImpact);
  }

  // Case library, optionally narrowed to one signal kind and/or one outcome.
  async listCases(user: AuthUser, filters: { kind?: string; outcome?: string } = {}): Promise<CiCase[]> {
    const kind = asTrimmedString(filters.kind);
    const outcome = asTrimmedString(filters.outcome);
    return (await this.request<AgentCase[]>(user, 'get', '/cases'))
      .map(toCase)
      .filter((item) => (!kind || item.signalKind === kind) && (!outcome || item.outcome === outcome));
  }

  async runNow(user: AuthUser): Promise<CiRunReport> {
    const report = await this.request<AgentTickReport>(user, 'post', '/runs', { timeout: RUN_TIMEOUT_MS });
    return {
      detected: report.detected.length,
      expired: report.expired.length,
      advanced: Object.keys(report.advanced).length,
      errors: Object.keys(report.errors).length,
    };
  }
}
