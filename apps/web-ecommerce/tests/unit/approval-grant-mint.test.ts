import nock from 'nock';
import request from 'supertest';
import { decodeJwt, jwtVerify } from 'jose';
import { hashAgentRequest } from '../../src/shared/server/utils/AgentApiUtils';
import { applyEdits, type ReviewAction } from '../../src/shared/server/utils/ApprovalGrantUtils';
import { AGENT_SERVER, gatewayApp } from './support/gatewayApp';

const T = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';
const discount: ReviewAction = {
  action_id: 'discount-1',
  type: 'apply_discount',
  endpoint: 'pricing/discounts',
  body: { skus: ['A1', 'A2'], percent: 20, duration_days: 14 },
  idempotency_key: `${T}:discount:1`,
  editable_fields: ['percent', 'duration_days'],
};
const task: ReviewAction = {
  action_id: 'discount-2',
  type: 'create_task',
  endpoint: 'tasks',
  body: { title: 'Hiển thị', assignee_role: 'merchandiser', due_in_days: 2 },
  idempotency_key: `${T}:discount:2`,
  editable_fields: ['title', 'description', 'due_in_days'],
};
const review = {
  type: 'proposal_review',
  recommended_option_id: 'discount',
  options: [
    { option_id: 'discount', strategy: 'discount', actions: [discount, task] },
    { option_id: 'do_nothing', strategy: 'do_nothing', actions: [] },
  ],
};

describe('applyEdits (mirrors the agent)', () => {
  it('applies a field to every action that declares it, and refuses the rest', () => {
    const [edited, untouched] = applyEdits([discount, task], { percent: 25 });
    expect(edited.body.percent).toBe(25);
    expect(untouched.body).toEqual(task.body);
    expect(edited.idempotency_key).toBe(discount.idempotency_key);
    expect(() => applyEdits([discount], { skus: ['X'] })).toThrow();
    expect(() => applyEdits([discount], { percent: '25' })).toThrow();
    expect(() => applyEdits([discount], { percent: Number.NaN })).toThrow();
  });
});

describe('minting grants on resume', () => {
  let app: Awaited<ReturnType<typeof gatewayApp>>;
  beforeAll(async () => {
    app = await gatewayApp();
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });
  afterEach(() => nock.cleanAll());
  afterAll(() => nock.enableNetConnect());

  const resume = async (decision: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
    let forwarded: { command: { resume: Record<string, unknown> } } | undefined;
    nock(AGENT_SERVER)
      .get(`/threads/${T}/state`)
      .reply(200, { values: {}, tasks: [{ id: 't', interrupts: [{ id: 'i', value: review }] }] });
    nock(AGENT_SERVER)
      .post(`/threads/${T}/runs`, (body) => {
        forwarded = body;
        return true;
      })
      .reply(200, { run_id: 'r1' });
    const res = await request(app)
      .post(`/api/admin/agent/server/threads/${T}/runs`)
      .set('x-test-role', 'ADMIN')
      .send({ assistant_id: 'improvement', command: { resume: decision }, ...extra });
    return { res, decision: forwarded?.command.resume };
  };

  const verify = async (grant: unknown) =>
    (await jwtVerify(String(grant), new TextEncoder().encode(process.env.AGENT_APPROVAL_SECRET))).payload;

  it('binds the grant to the exact bodies and keys, with the approver from the session', async () => {
    const { res, decision } = await resume({ type: 'approve', option_id: 'discount', approver: 'x', grant: 'forged' });
    expect(res.status).toBe(200);
    expect(decision).toMatchObject({ type: 'approve', option_id: 'discount', approver: '7' });
    const claims = await verify(decision?.grant);
    expect(claims).toMatchObject({ typ: 'approval', sub: '7', thread_id: T, option_id: 'discount' });
    expect(claims.actions).toEqual([
      {
        action_id: 'discount-1',
        endpoint: 'pricing/discounts',
        idempotency_key: `${T}:discount:1`,
        body_hash: hashAgentRequest('pricing/discounts', discount.body),
      },
      {
        action_id: 'discount-2',
        endpoint: 'tasks',
        idempotency_key: `${T}:discount:2`,
        body_hash: hashAgentRequest('tasks', task.body),
      },
    ]);
    expect(Number(claims.exp) - Number(claims.iat)).toBe(24 * 3600);
  });

  it('an edit changes the signed hash of the edited body only', async () => {
    const { decision } = await resume({ type: 'edit', option_id: 'discount', args: { percent: 25 } });
    const actions = decodeJwt(String(decision?.grant)).actions as { body_hash: string }[];
    expect(actions[0].body_hash).toBe(hashAgentRequest('pricing/discounts', { ...discount.body, percent: 25 }));
    expect(actions[0].body_hash).not.toBe(hashAgentRequest('pricing/discounts', discount.body));
    expect(actions[1].body_hash).toBe(hashAgentRequest('tasks', task.body));
    expect(decision?.args).toEqual({ percent: 25 });
  });

  it('rejections and responses carry no grant; "do nothing" needs none', async () => {
    expect((await resume({ type: 'reject', note: 'Chưa xả hàng' })).decision).toEqual({
      type: 'reject',
      approver: '7',
      note: 'Chưa xả hàng',
    });
    const nothing = await resume({ type: 'approve', option_id: 'do_nothing' });
    expect(nothing.decision?.grant).toBeUndefined();
  });

  it('refuses decisions a person may not send, and new input on an improvement thread', async () => {
    expect((await resume({ type: 'expire' })).res.status).toBe(400);
    expect((await resume({ type: 'edit', option_id: 'discount', args: { skus: ['X'] } })).res.status).toBe(400);
    expect((await resume({ type: 'approve', option_id: 'nope' })).res.status).toBe(400);
    const input = await request(app)
      .post(`/api/admin/agent/server/threads/${T}/runs`)
      .set('x-test-role', 'ADMIN')
      .send({ assistant_id: 'improvement', input: { stage: 'acting' } });
    expect(input.status).toBe(403);
  });

  it('answers 409 when nothing is waiting for a decision', async () => {
    nock(AGENT_SERVER).get(`/threads/${T}/state`).reply(200, { values: {}, tasks: [] });
    const res = await request(app)
      .post(`/api/admin/agent/server/threads/${T}/runs`)
      .set('x-test-role', 'ADMIN')
      .send({ assistant_id: 'improvement', command: { resume: { type: 'approve' } } });
    expect(res.status).toBe(409);
  });
});
