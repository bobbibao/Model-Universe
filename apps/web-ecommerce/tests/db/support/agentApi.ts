import request from 'supertest';
import type { Express } from 'express';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { grantClaims, signApprovalGrant } from '../../../src/shared/server/utils/ApprovalGrantUtils';

// Calls to the Agent API as the shop agent makes them (Idempotency-Key, X-Agent-Approval, X-Agent-Context), and
// approval grants signed like the gateway signs them.

export const APPROVAL_SECRET = 'test-approval-secret-of-at-least-32-bytes';

export const useApprovalSecret = () => {
  process.env.AGENT_APPROVAL_SECRET = APPROVAL_SECRET;
};

export interface AgentCall {
  path: string; // e.g. `pricing/discounts`, `marketing/ads/ad-1/activate`
  body?: Record<string, unknown>;
  key: string;
  grant?: string;
  actionId?: string;
  context?: Record<string, unknown>;
  traceparent?: string;
}

export const callAgent = (app: Express, { path, body = {}, key, grant, actionId, context, traceparent }: AgentCall) => {
  let call = request(app).post(`/api/agent/v1/${path}`).set('Idempotency-Key', key);
  if (grant) call = call.set('X-Agent-Approval', grant);
  const agentContext = { ...(actionId ? { action_id: actionId } : {}), ...context };
  if (Object.keys(agentContext).length > 0) call = call.set('X-Agent-Context', JSON.stringify(agentContext));
  if (traceparent) call = call.set('traceparent', traceparent);
  return call.send(body);
};

// A grant covering exactly these requests (each one's action id, path, key and body).
export const grantFor = (
  actions: { actionId: string; path: string; key: string; body: Record<string, unknown> }[],
  { now, threadId = 'thread-test', approverId = 1 }: { now?: number; threadId?: string; approverId?: number } = {},
) =>
  signApprovalGrant(
    grantClaims({
      approverId,
      threadId,
      optionId: 'opt-1',
      actions: actions.map((action) => ({
        action_id: action.actionId,
        type: 'test',
        endpoint: action.path,
        body: action.body,
        idempotency_key: action.key,
        editable_fields: [],
      })),
      now,
    }),
  );

// Calls with a grant made for this very call.
export const callApproved = async (app: Express, call: AgentCall) => {
  const actionId = call.actionId ?? `act-${call.key}`;
  const grant = await grantFor([{ actionId, path: call.path, key: call.key, body: call.body ?? {} }]);
  return callAgent(app, { ...call, actionId, grant });
};

export const setAgentSetting = (sequelize: Sequelize, key: string, value: unknown) =>
  sequelize.query('UPDATE agent_setting SET value = CAST(:value AS jsonb) WHERE key = :key', {
    replacements: { key, value: JSON.stringify(value) },
  });

export const setAutonomy = async (sequelize: Sequelize, modes: Record<string, string>) => {
  const [row] = await sequelize.query<{ value: Record<string, string> }>(
    "SELECT value FROM agent_setting WHERE key = 'autonomy'",
    { type: QueryTypes.SELECT },
  );
  await setAgentSetting(sequelize, 'autonomy', { ...row.value, ...modes });
};

// Products the rules allow to discount: on sale for more than 30 days, not archived, in id order.
export const establishedProducts = (sequelize: Sequelize, count: number, offset = 0) =>
  sequelize.query<{ id: number; sku: string; price: number; cost: number }>(
    `SELECT id, sku, price, "importPrice" AS cost FROM product
     WHERE NOT "isArchived" AND "createdAt" < NOW() - INTERVAL '31 days'
     ORDER BY id LIMIT :count OFFSET :offset`,
    { replacements: { count, offset }, type: QueryTypes.SELECT },
  );

export const select = <T extends object>(
  sequelize: Sequelize,
  sql: string,
  replacements: Record<string, unknown> = {},
) => sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT });
