import { createHash, timingSafeEqual } from 'crypto';
import { Response } from 'express';
import HttpError from './HttpError';
import Logger from './logger';

// Helpers for the machine-to-machine Agent API (/api/agent/v1, called by apps/agent-service).
// Unlike the rest of the API it answers with flat JSON, as specified in
// packages/contracts/openapi/web-agent-api.yaml: `{ ref, detail }` on success and `{ error, details? }`
// on failure. Its messages are for the agent's logs, so they are in English.

// Constant-time comparison that does not leak the length of the expected value.
export const safeEqual = (actual: string, expected: string): boolean => {
  const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();
  return timingSafeEqual(digest(actual), digest(expected));
};

// JSON with object keys sorted at every level, so that equal payloads hash equally.
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value ?? null);
};

export const hashAgentRequest = (endpoint: string, body: unknown): string =>
  createHash('sha256')
    .update(`${endpoint}\n${canonicalJson(body)}`)
    .digest('hex');

// The contract's error codes (packages/contracts/openapi/web-agent-api.yaml, components.schemas.Error).
export type AgentErrorCode =
  | 'invalid_request'
  | 'unauthorized'
  | 'not_found'
  | 'conflict'
  | 'agent_disabled'
  | 'approval_required'
  | 'overlap'
  | 'budget_exceeded'
  | 'limit_exceeded'
  | 'platform_error'
  | 'unavailable'
  | 'internal';

const STATUS_OF: Record<AgentErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  agent_disabled: 403,
  approval_required: 403,
  not_found: 404,
  conflict: 409,
  overlap: 409,
  budget_exceeded: 409,
  limit_exceeded: 422,
  internal: 500,
  platform_error: 502,
  unavailable: 503,
};

const CODE_OF: Record<number, AgentErrorCode> = {
  400: 'invalid_request',
  401: 'unauthorized',
  403: 'approval_required',
  404: 'not_found',
  409: 'conflict',
  422: 'limit_exceeded',
  502: 'platform_error',
  503: 'unavailable',
};

// A refusal with the contract's error code, the rule's name (`reason`) and, for platform errors, whether a retry may
// succeed.
export class AgentApiError extends HttpError {
  readonly code: AgentErrorCode;
  readonly reason?: string;
  readonly retryable?: boolean;

  constructor(
    code: AgentErrorCode,
    message: string,
    options: { reason?: string; details?: string[]; retryable?: boolean } = {},
  ) {
    super(STATUS_OF[code], message, options.details);
    this.name = 'AgentApiError';
    this.code = code;
    this.reason = options.reason;
    this.retryable = options.retryable;
  }
}

export const sendAgentError = (res: Response, error: unknown, context: string) => {
  if (error instanceof HttpError) {
    const code = error instanceof AgentApiError ? error.code : (CODE_OF[error.statusCode] ?? 'internal');
    return res.status(error.statusCode).json({
      error: error.message,
      code,
      ...(error instanceof AgentApiError && error.reason ? { reason: error.reason } : {}),
      ...(error.validationMessages ? { details: error.validationMessages } : {}),
      ...(error instanceof AgentApiError && error.retryable !== undefined ? { retryable: error.retryable } : {}),
    });
  }
  Logger.ERROR(`Error in ${context}: `, error);
  return res.status(500).json({ error: 'Internal error', code: 'internal' });
};
