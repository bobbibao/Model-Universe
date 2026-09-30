import { createHash, createHmac, timingSafeEqual } from 'crypto';
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

// `X-CI-Signature: sha256=<hex hmac-sha256 of the raw body>`, as sent by the agent's WebWebhookPublisher.
export const isValidAgentSignature = (rawBody: Buffer | undefined, header: unknown, secret: string): boolean => {
  if (!rawBody || typeof header !== 'string') return false;
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  return safeEqual(header, expected);
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

export const sendAgentError = (res: Response, error: unknown, context: string) => {
  if (error instanceof HttpError) {
    return res.status(error.statusCode).json({ error: error.message, details: error.validationMessages });
  }
  Logger.ERROR(`Error in ${context}: `, error);
  return res.status(500).json({ error: 'Internal error' });
};
