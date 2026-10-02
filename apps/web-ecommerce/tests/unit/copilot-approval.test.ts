import nock from 'nock';
import request from 'supertest';
import { jwtVerify } from 'jose';
import { hashAgentRequest } from '../../src/shared/server/utils/AgentApiUtils';
import type { ApprovalGrantClaims } from '../../src/shared/server/utils/ApprovalGrantUtils';
import { AGENT_SERVER, gatewayApp } from './support/gatewayApp';

// The copilot's approvals (docs/ARCHITECTURE.md section 8): the gateway rebuilds the resume of a paused tool call,
// signs one grant over the exact requests of the approved or edited shop writes, keyed `{thread_id}:{tool_call_id}`,
// and puts it in the thread's state with `command.update`. A browser never supplies a grant.
const T = '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const discount = { skus: ['OLD1'], percent: 20, duration_days: 7 };
const memory = { file_path: '/memories/AGENTS.md', content: '- Không giảm quá 15%.\n' };
const PENDING = {
  values: {
    messages: [
      { type: 'human', content: 'Giảm 20% cho OLD1' },
      {
        type: 'ai',
        content: '',
        tool_calls: [
          { id: 'call-a', name: 'get_stock', args: { skus: ['OLD1'] } },
          { id: 'call-b', name: 'apply_discount', args: discount },
          { id: 'call-c', name: 'pause_ad', args: { ref: 'ad-1' } },
          { id: 'call-d', name: 'write_file', args: memory },
        ],
      },
    ],
  },
  tasks: [
    {
      id: 't',
      interrupts: [
        {
          id: 'i',
          value: {
            action_requests: [
              { name: 'apply_discount', args: discount, description: 'Giảm 20% cho 1 mã trong 7 ngày' },
              { name: 'write_file', args: memory },
            ],
            review_configs: [
              { action_name: 'apply_discount', allowed_decisions: ['approve', 'edit', 'reject'] },
              { action_name: 'write_file', allowed_decisions: ['approve', 'reject'] },
            ],
          },
        },
      ],
    },
  ],
};

describe('copilot approvals', () => {
  let app: Awaited<ReturnType<typeof gatewayApp>>;
  beforeAll(async () => {
    app = await gatewayApp();
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });
  afterEach(() => nock.cleanAll());
  afterAll(() => nock.enableNetConnect());

  const send = async (body: Record<string, unknown>, state: Record<string, unknown> = PENDING) => {
    let forwarded: Record<string, unknown> | undefined;
    nock.cleanAll(); // a refused call never reaches the Agent Server
    nock(AGENT_SERVER).get(`/threads/${T}/state`).reply(200, state);
    nock(AGENT_SERVER)
      .post(`/threads/${T}/runs`, (sent) => {
        forwarded = sent;
        return true;
      })
      .reply(200, { run_id: 'r1' });
    const res = await request(app)
      .post(`/api/admin/agent/server/threads/${T}/runs`)
      .set('x-test-role', 'ADMIN')
      .send({ assistant_id: 'assistant', ...body });
    return { res, forwarded };
  };
  const resume = (decisions: unknown[]) => send({ command: { resume: { decisions } } });
  const claimsOf = async (token: string) =>
    (await jwtVerify(token, new TextEncoder().encode(process.env.AGENT_APPROVAL_SECRET)))
      .payload as unknown as ApprovalGrantClaims;

  it('signs a grant over the approved write, for its own tool call only', async () => {
    const { res, forwarded } = await resume([{ type: 'approve' }, { type: 'approve' }]);
    expect(res.status).toBe(200);
    const command = forwarded?.command as { resume: unknown; update: { approval_grants: Record<string, string> } };
    expect(command.resume).toEqual({ decisions: [{ type: 'approve' }, { type: 'approve' }] });
    expect(Object.keys(command.update.approval_grants)).toEqual(['call-b']); // the memory note needs no grant
    const claims = await claimsOf(command.update.approval_grants['call-b']);
    expect(claims).toMatchObject({ sub: '7', thread_id: T, tool_call_ids: ['call-b'] });
    expect(claims.actions).toEqual([
      {
        action_id: 'call-b',
        endpoint: 'pricing/discounts',
        idempotency_key: `${T}:call-b`,
        body_hash: hashAgentRequest('pricing/discounts', discount),
      },
    ]);
  });

  it('applies an edit of an editable field and signs the edited request', async () => {
    const { res, forwarded } = await resume([{ type: 'edit', args: { percent: 15 } }, { type: 'reject' }]);
    expect(res.status).toBe(200);
    const command = forwarded?.command as {
      resume: { decisions: unknown[] };
      update: { approval_grants: Record<string, string> };
    };
    const edited = { ...discount, percent: 15 };
    expect(command.resume.decisions).toEqual([
      { type: 'edit', edited_action: { name: 'apply_discount', args: edited } },
      { type: 'reject' },
    ]);
    const claims = await claimsOf(command.update.approval_grants['call-b']);
    expect(claims.actions[0].body_hash).toBe(hashAgentRequest('pricing/discounts', edited));
  });

  it('refuses edits outside the editable fields, unknown decisions and a wrong count', async () => {
    expect((await resume([{ type: 'edit', args: { skus: ['X'] } }, { type: 'approve' }])).res.status).toBe(400);
    expect((await resume([{ type: 'approve' }, { type: 'edit', args: { content: 'x' } }])).res.status).toBe(400);
    expect((await resume([{ type: 'respond', message: 'ok' }, { type: 'approve' }])).res.status).toBe(400);
    expect((await resume([{ type: 'approve' }])).res.status).toBe(400);
  });

  it('passes a rejection note and signs nothing when nothing is approved', async () => {
    const { forwarded } = await resume([{ type: 'reject', note: 'Không giảm tháng này.' }, { type: 'reject' }]);
    expect(forwarded?.command).toEqual({
      resume: { decisions: [{ type: 'reject', message: 'Không giảm tháng này.' }, { type: 'reject' }] },
    });
  });

  it('answers 409 when nothing waits for approval', async () => {
    const { res } = await send(
      { command: { resume: { decisions: [{ type: 'approve' }] } } },
      { values: {}, tasks: [] },
    );
    expect(res.status).toBe(409);
  });

  it('forwards only the messages of a chat input, and never a command from the browser', async () => {
    nock.cleanAll();
    let forwarded: Record<string, unknown> | undefined;
    nock(AGENT_SERVER)
      .post(`/threads/${T}/runs`, (sent) => {
        forwarded = sent;
        return true;
      })
      .reply(200, { run_id: 'r2' });
    const message = { type: 'human', content: 'Doanh thu hôm qua?' };
    const res = await request(app)
      .post(`/api/admin/agent/server/threads/${T}/runs`)
      .set('x-test-role', 'ADMIN')
      .send({ assistant_id: 'assistant', input: { messages: [message], approval_grants: { x: 'forged' } } });
    expect(res.status).toBe(200);
    expect(forwarded?.input).toEqual({ messages: [message] });
    const update = await send({ command: { resume: { decisions: [] }, update: { approval_grants: { x: 'y' } } } });
    expect(update.res.status).toBe(403);
  });
});
