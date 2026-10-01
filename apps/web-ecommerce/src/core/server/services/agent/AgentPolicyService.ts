import { QueryTypes, Transaction } from 'sequelize';
import DatabaseProvider from '../../database/Database.Provider';
import { AgentApiError } from '../../../../shared/server/utils/AgentApiUtils';
import { verifyApprovalGrant, type ApprovalGrantClaims } from '../../../../shared/server/utils/ApprovalGrantUtils';
import Logger from '../../../../shared/server/utils/logger';
import MailService from '../MailService';
import { evaluate, POLICY_VERSION, type AgentRoute, type ShopState, type Verdict } from './AgentLimits';
import { loadShopState } from './AgentState';

// Decides whether the shop agent may make a write (docs/GROWTH_AGENT.md section 4; the contract's header lists the
// order). A grant in `X-Agent-Approval` must cover exactly this request; then the rules of AgentLimits run over the
// shop's state read inside the request's transaction. Agent writes are serialized by one transaction-scoped advisory
// lock, so two requests never pass the same check against the same state (two discounts on one SKU, two ads into
// the last of the month's budget).

const MAX_CONTEXT_LENGTH = 4096;
const TRACEPARENT = /^[0-9a-f]{2}-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/;

// What the agent says about the request (X-Agent-Context), recorded on the action for the audit.
export interface AgentContext {
  thread_id?: string;
  run_id?: string;
  option_id?: string;
  action_id?: string;
  step_no?: number;
  approver?: string;
  approval_mode?: string;
  risk_tier?: string;
  model_profile?: string;
  prompt_version?: string;
  policy_version?: string;
}

const CONTEXT_FIELDS: (keyof AgentContext)[] = [
  'thread_id',
  'run_id',
  'option_id',
  'action_id',
  'approver',
  'approval_mode',
  'risk_tier',
  'model_profile',
  'prompt_version',
  'policy_version',
];

export const parseAgentContext = (header: string | undefined): AgentContext => {
  if (!header) return {};
  if (header.length > MAX_CONTEXT_LENGTH) {
    throw new AgentApiError('invalid_request', `X-Agent-Context is longer than ${MAX_CONTEXT_LENGTH} characters`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(header);
  } catch {
    throw new AgentApiError('invalid_request', 'X-Agent-Context must be a JSON object');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AgentApiError('invalid_request', 'X-Agent-Context must be a JSON object');
  }
  const values = raw as Record<string, unknown>;
  const context: AgentContext = {};
  for (const field of CONTEXT_FIELDS) {
    const value = values[field];
    if (value !== undefined && value !== null)
      (context as Record<string, unknown>)[field] = String(value).slice(0, 255);
  }
  if (Number.isInteger(values.step_no)) context.step_no = values.step_no as number;
  return context;
};

// The trace id of a W3C traceparent header, or null.
export const traceIdOf = (traceparent: string | undefined): string | null =>
  TRACEPARENT.exec(traceparent?.trim().toLowerCase() ?? '')?.[1] ?? null;

export interface PolicyDecision {
  verdict: Verdict;
  state: ShopState;
  grant: ApprovalGrantClaims | null;
}

export interface WriteRequest {
  route: AgentRoute;
  path: Record<string, string>;
  endpoint: string; // the concrete path the grant names
  idempotencyKey: string;
  body: Record<string, unknown>; // without `dry_run`
  grant?: string;
  context: AgentContext;
}

export default class AgentPolicyService {
  // Waits for any other agent write to finish (released when the transaction ends).
  async serialize(transaction: Transaction) {
    await DatabaseProvider.getInstance().query("SELECT pg_advisory_xact_lock(hashtext('agent-api-write'))", {
      type: QueryTypes.SELECT,
      transaction,
    });
  }

  // The verdict for a write, or the refusal as an AgentApiError (403, 404, 409, 422, or 400 for the body).
  async decide(request: WriteRequest, transaction: Transaction, now = new Date()): Promise<PolicyDecision> {
    let grant: ApprovalGrantClaims | null = null;
    if (request.grant) {
      const check = await verifyApprovalGrant(request.grant, {
        actionId: request.context.action_id,
        endpoint: request.endpoint,
        idempotencyKey: request.idempotencyKey,
        body: request.body,
      });
      if (!check.ok) throw new AgentApiError('approval_required', check.problem, { reason: 'invalid_grant' });
      grant = check.claims;
    }
    const state = await loadShopState(transaction, now);
    const verdict = evaluate(request.route, request.path, request.body, state, grant !== null);
    if (verdict.status !== 200) {
      const code = (verdict.code ?? 'invalid_request') as ConstructorParameters<typeof AgentApiError>[0];
      throw new AgentApiError(code, verdict.detail, {
        ...(verdict.reason ? { reason: verdict.reason } : {}),
        ...(verdict.status === 400 ? { details: verdict.detail.split('; ') } : {}),
      });
    }
    return { verdict, state, grant };
  }

  // The audit columns of an applied action.
  audit(decision: PolicyDecision | null, context: AgentContext, traceparent: string | undefined) {
    const approver = decision?.grant?.sub;
    return {
      threadId: context.thread_id ?? null,
      runId: context.run_id ?? null,
      optionId: context.option_id ?? null,
      actionId: context.action_id ?? null,
      stepNo: context.step_no ?? null,
      writeClass: decision?.verdict.writeClass ?? 'ingestion',
      approvalMode: decision?.verdict.approval ?? 'ingestion',
      approverUserId: approver && /^\d+$/.test(approver) ? Number(approver) : null,
      grantJti: decision?.grant?.jti ?? null,
      riskTier: context.risk_tier ?? null,
      policyVersion: POLICY_VERSION,
      modelProfile: context.model_profile ?? null,
      promptVersion: context.prompt_version ?? null,
      traceId: traceIdOf(traceparent),
    };
  }

  // Protective writes are always allowed and the admins hear about them (after the write is committed).
  async notifyProtective(endpoint: string, detail: string, idempotencyKey: string) {
    try {
      await new MailService().sendNotification({
        subject: 'Tác tử AI đã thực hiện một thao tác bảo vệ',
        message: `Thao tác: ${endpoint}\nKết quả: ${detail}\nMã yêu cầu: ${idempotencyKey}`,
        severity: 'warning',
        dedupeKey: `protective:${idempotencyKey}`.slice(0, 128),
      });
    } catch (error) {
      Logger.ERROR('Could not notify the admins of a protective agent write:', error);
    }
  }
}
