import nock from 'nock';
import request from 'supertest';
import AgentApprovalModel from '../../src/core/server/database/client/models/AgentApproval.Model';
import AgentSettingModel from '../../src/core/server/database/client/models/AgentSetting.Model';
import type { ReviewAction } from '../../src/shared/server/utils/ApprovalGrantUtils';
import { AGENT_SERVER, gatewayApp } from './support/gatewayApp';

// Approving a high-tier option (docs/GROWTH_AGENT.md section 4, decision Q8): the password re-entered in the last
// STEP_UP_MAX_AGE_SECONDS, the exact total typed, no edits, and with `approvals.high.two_person` two distinct admins.
const T = '1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d';
const ad: ReviewAction = {
  action_id: 'ads-2',
  type: 'create_ad',
  endpoint: 'marketing/ads',
  body: { ref: 'a-1a2b3c4d-ads-meta', campaign_ref: 'ag-1a2b3c4d-ads', platform: 'meta', daily_budget_vnd: 200000,
          duration_days: 7, link_path: '/shop', headline: 'Áo mới', primary_text: 'Áo mới về', sku: 'A1' }, // prettier-ignore
  idempotency_key: `${T}:ads:2`,
  editable_fields: ['daily_budget_vnd', 'duration_days'],
};
const review = {
  type: 'proposal_review',
  recommended_option_id: 'ads',
  options: [{ option_id: 'ads', strategy: 'ads', tier: 'high', total_vnd: 1400000, actions: [ad] }],
};

describe('high-tier approval', () => {
  let app: Awaited<ReturnType<typeof gatewayApp>>;
  let twoPerson = false;
  const approvals: { approverUserId: number }[] = [];
  beforeAll(async () => {
    app = await gatewayApp();
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
    jest
      .spyOn(AgentSettingModel, 'findByPk')
      .mockImplementation(async () => (twoPerson ? ({ value: true } as AgentSettingModel) : null));
    jest.spyOn(AgentApprovalModel, 'count').mockImplementation(async (options) => {
      const me = (options?.where as { approverUserId: { [k: symbol]: number } }).approverUserId;
      const id = Object.getOwnPropertySymbols(me).map((s) => me[s])[0];
      return approvals.filter((a) => a.approverUserId !== id).length as never;
    });
    jest.spyOn(AgentApprovalModel, 'findOrCreate').mockImplementation(async (options) => {
      approvals.push({ approverUserId: (options.where as { approverUserId: number }).approverUserId });
      return [{} as AgentApprovalModel, true];
    });
  });
  afterEach(() => nock.cleanAll());
  afterAll(() => {
    nock.enableNetConnect();
    jest.restoreAllMocks();
  });

  const approve = async (decision: Record<string, unknown>, headers: Record<string, string> = {}) => {
    let forwarded: { command: { resume: Record<string, unknown> } } | undefined;
    nock.cleanAll(); // a refused approval never reaches the Agent Server: drop its unused interceptors
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
      .set({ 'x-test-role': 'ADMIN', ...headers })
      .send({ assistant_id: 'improvement', command: { resume: decision } });
    return { res, resume: forwarded?.command.resume };
  };
  const now = () => String(Math.floor(Date.now() / 1000));
  const fresh = () => ({ 'x-test-step-up': now() });

  it('refuses without a fresh step-up', async () => {
    const none = await approve({ type: 'approve', option_id: 'ads', confirm_total_vnd: 1400000 });
    expect(none.res.status).toBe(403);
    const stale = await approve(
      { type: 'approve', option_id: 'ads', confirm_total_vnd: 1400000 },
      { 'x-test-step-up': String(Math.floor(Date.now() / 1000) - 301) },
    );
    expect(stale.res.status).toBe(403);
    expect(stale.resume).toBeUndefined();
  });

  it('refuses a wrong typed total and any edit', async () => {
    const wrong = await approve({ type: 'approve', option_id: 'ads', confirm_total_vnd: 140000 }, fresh());
    expect(wrong.res.status).toBe(400);
    const edit = await approve(
      { type: 'edit', option_id: 'ads', args: { daily_budget_vnd: 100000 }, confirm_total_vnd: 1400000 },
      fresh(),
    );
    expect(edit.res.status).toBe(400);
  });

  it('signs the grant after a fresh step-up and the exact total', async () => {
    const ok = await approve({ type: 'approve', option_id: 'ads', confirm_total_vnd: 1400000 }, fresh());
    expect(ok.res.status).toBe(200);
    expect(typeof ok.resume?.grant).toBe('string');
  });

  it('needs two distinct admins in two-person mode', async () => {
    twoPerson = true;
    const first = await approve({ type: 'approve', option_id: 'ads', confirm_total_vnd: 1400000 }, fresh());
    expect(first.res.status).toBe(409);
    expect(first.resume).toBeUndefined();
    const again = await approve({ type: 'approve', option_id: 'ads', confirm_total_vnd: 1400000 }, fresh());
    expect(again.res.status).toBe(409); // the same admin twice is still one person
    const second = await approve(
      { type: 'approve', option_id: 'ads', confirm_total_vnd: 1400000 },
      { ...fresh(), 'x-test-user-id': '8' },
    );
    expect(second.res.status).toBe(200);
    expect(second.resume).toMatchObject({ approver: '8', grant: expect.any(String) });
  });
});
