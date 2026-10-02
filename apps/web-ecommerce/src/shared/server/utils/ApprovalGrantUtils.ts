import { randomUUID } from 'crypto';
import { SignJWT, errors as joseErrors, jwtVerify } from 'jose';
import HttpError from './HttpError';
import { hashAgentRequest } from './AgentApiUtils';

// Approval grants (docs/adr/0011): when an admin approves or edits a proposal, the gateway signs the exact requests
// the agent will send (endpoint, idempotency key, hash of the body). The agent forwards the grant with each write;
// the Agent API verifies it before applying (`verifyApprovalGrant`), so a buggy or prompt-injected agent cannot act
// without approval.
// Claims mirror apps/agent-service src/shop_agent/domain/approval.py (ApprovalGrant).

export const GRANT_TTL_SECONDS = 24 * 60 * 60;

export interface ReviewAction {
  action_id: string;
  type: string;
  endpoint: string;
  body: Record<string, unknown>;
  idempotency_key: string;
  editable_fields: string[];
}

export interface ReviewOption {
  option_id: string;
  strategy: string;
  actions: ReviewAction[];
  tier?: string; // protective | low | medium | high
  total_vnd?: number; // ad spend plus discount exposure, as the agent's validate computed it
}

export interface GrantAction {
  action_id: string;
  endpoint: string;
  idempotency_key: string;
  body_hash: string;
}

export interface ApprovalGrantClaims {
  typ: 'approval';
  jti: string;
  sub: string;
  thread_id: string;
  option_id?: string;
  tool_call_ids?: string[];
  actions: GrantAction[];
  iat: number;
  exp: number;
}

const kind = (value: unknown) => (Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value);

// An edit of an option (`{ percent: 25 }`), applied exactly as the agent applies it (domain.actions.apply_edits):
// each field goes to every action that lists it in `editable_fields`; a field no action lists is refused. A value
// must keep its JSON type, so the body the agent validates hashes the same on both sides.
export const applyEdits = (actions: ReviewAction[], args: Record<string, unknown>): ReviewAction[] => {
  const editable = new Set(actions.flatMap((action) => action.editable_fields));
  const refused = Object.keys(args).filter((field) => !editable.has(field));
  if (refused.length > 0) {
    throw HttpError.badRequest('Không được sửa các trường này.', refused);
  }
  return actions.map((action) => {
    const body = { ...action.body };
    for (const [field, value] of Object.entries(args)) {
      if (!action.editable_fields.includes(field)) continue;
      const original = action.body[field];
      const valid =
        kind(value) === kind(original) || (original === undefined && ['number', 'string'].includes(kind(value)));
      if (!valid || (typeof value === 'number' && !Number.isFinite(value))) {
        throw HttpError.badRequest(`Giá trị không hợp lệ cho trường ${field}.`);
      }
      body[field] = value;
    }
    return { ...action, body };
  });
};

export const grantClaims = (params: {
  approverId: number | string;
  threadId: string;
  actions: ReviewAction[];
  optionId?: string;
  toolCallIds?: string[];
  now?: number;
}): ApprovalGrantClaims => {
  const iat = params.now ?? Math.floor(Date.now() / 1000);
  return {
    typ: 'approval',
    jti: randomUUID(),
    sub: String(params.approverId),
    thread_id: params.threadId,
    ...(params.optionId ? { option_id: params.optionId } : {}),
    ...(params.toolCallIds ? { tool_call_ids: params.toolCallIds } : {}),
    actions: params.actions.map((action) => ({
      action_id: action.action_id,
      endpoint: action.endpoint,
      idempotency_key: action.idempotency_key,
      body_hash: hashAgentRequest(action.endpoint, action.body),
    })),
    iat,
    exp: iat + GRANT_TTL_SECONDS,
  };
};

export const signApprovalGrant = async (claims: ApprovalGrantClaims): Promise<string> => {
  const secret = process.env.AGENT_APPROVAL_SECRET;
  if (!secret) throw new Error('AGENT_APPROVAL_SECRET is not configured');
  return new SignJWT({ ...claims }).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(secret));
};

export const CLOCK_LEEWAY_SECONDS = 10;

export interface GrantedRequest {
  actionId: string | undefined; // from X-Agent-Context
  endpoint: string; // the concrete path, e.g. `marketing/ads/<ref>/activate`
  idempotencyKey: string;
  body: Record<string, unknown>; // the request body without `dry_run`
}

export type GrantCheck = { ok: true; claims: ApprovalGrantClaims } | { ok: false; problem: string };

// Does this grant cover exactly this request? Signature and expiry first, then the action, endpoint, key and body,
// the same checks as the agent's FakeShop (apps/agent-service domain/approval.py `grant_violation`).
export const verifyApprovalGrant = async (
  token: string,
  request: GrantedRequest,
  now?: number,
): Promise<GrantCheck> => {
  const secret = process.env.AGENT_APPROVAL_SECRET;
  if (!secret) return { ok: false, problem: 'AGENT_APPROVAL_SECRET is not configured' };
  let claims: ApprovalGrantClaims;
  try {
    const verified = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ['HS256'],
      clockTolerance: CLOCK_LEEWAY_SECONDS,
      ...(now !== undefined ? { currentDate: new Date(now * 1000) } : {}),
    });
    claims = verified.payload as unknown as ApprovalGrantClaims;
  } catch (error) {
    const expired = error instanceof joseErrors.JWTExpired;
    return { ok: false, problem: expired ? 'grant expired' : 'invalid approval grant' };
  }
  if (claims.typ !== 'approval') return { ok: false, problem: 'not an approval grant' };
  if (!Array.isArray(claims.actions)) return { ok: false, problem: 'invalid approval grant' };
  const action = claims.actions.find((item) => item.action_id === request.actionId);
  if (!action) return { ok: false, problem: `action ${request.actionId ?? '(none)'} is not in the grant` };
  if (action.endpoint !== request.endpoint) {
    return { ok: false, problem: `grant covers ${action.endpoint}, not ${request.endpoint}` };
  }
  if (action.idempotency_key !== request.idempotencyKey) {
    return { ok: false, problem: 'idempotency key differs from the approved one' };
  }
  if (action.body_hash !== hashAgentRequest(request.endpoint, request.body)) {
    return { ok: false, problem: 'body differs from the approved one' };
  }
  return { ok: true, claims };
};
