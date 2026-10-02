import nock from 'nock';
import request from 'supertest';
import { jwtVerify } from 'jose';
import { AGENT_SERVER, gatewayApp } from './support/gatewayApp';

const BASE = '/api/admin/agent/server';

describe('gateway auth', () => {
  let app: Awaited<ReturnType<typeof gatewayApp>>;
  beforeAll(async () => {
    app = await gatewayApp();
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });
  afterEach(() => nock.cleanAll());
  afterAll(() => nock.enableNetConnect());

  it('forwards with a fresh actor token for the admin, never the browser credentials', async () => {
    let authorization = '';
    let cookie: string | undefined;
    nock(AGENT_SERVER)
      .post('/assistants/search')
      .reply(function reply() {
        authorization = String(this.req.headers.authorization);
        cookie = this.req.headers.cookie as string | undefined;
        return [200, [{ graph_id: 'improvement' }]];
      });
    const res = await request(app)
      .post(`${BASE}/assistants/search`)
      .set('x-test-role', 'ADMIN')
      .set('Cookie', 'access_token=browser-session')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ graph_id: 'improvement' }]);
    expect(cookie).toBeUndefined();
    const token = authorization.replace('Bearer ', '');
    const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.AGENT_ACTOR_SECRET), {
      issuer: 'web-ecommerce',
      audience: 'shop-agent',
    });
    expect(payload).toMatchObject({ typ: 'agent_actor', role: 'owner', sub: '7' });
    expect(Number(payload.exp) - Number(payload.iat)).toBeLessThanOrEqual(300);
  });

  it('refuses a route outside the allowlist without calling the agent', async () => {
    const res = await request(app).post(`${BASE}/runs/crons`).set('x-test-role', 'ADMIN').send({});
    expect(res.status).toBe(403);
    expect(nock.pendingMocks()).toEqual([]);
  });

  it('refuses non-admins', async () => {
    const res = await request(app).post(`${BASE}/assistants/search`).set('x-test-role', 'USER').send({});
    expect(res.status).toBe(403);
  });

  it('turns an agent 401 (secret mismatch) into 502 so the browser keeps its session', async () => {
    nock(AGENT_SERVER).post('/assistants/search').reply(401, { detail: 'invalid actor token' });
    const res = await request(app).post(`${BASE}/assistants/search`).set('x-test-role', 'ADMIN').send({});
    expect(res.status).toBe(502);
  });

  it('answers 503 when the Agent Server is down', async () => {
    process.env.AGENT_SERVER_URL = 'http://127.0.0.1:1'; // nothing listens there: the connection is refused
    try {
      const res = await request(app).post(`${BASE}/assistants/search`).set('x-test-role', 'ADMIN').send({});
      expect(res.status).toBe(503);
    } finally {
      process.env.AGENT_SERVER_URL = AGENT_SERVER;
    }
  });

  it('lets "Run now" start only the monitor', async () => {
    let sent: unknown;
    nock(AGENT_SERVER)
      .post('/runs', (body) => {
        sent = body;
        return true;
      })
      .reply(200, { run_id: 'r1' });
    const ok = await request(app).post(`${BASE}/runs`).set('x-test-role', 'ADMIN').send({ assistant_id: 'monitor' });
    expect(ok.status).toBe(200);
    expect(sent).toEqual({ assistant_id: 'monitor', input: {} });
    const denied = await request(app)
      .post(`${BASE}/runs`)
      .set('x-test-role', 'ADMIN')
      .send({ assistant_id: 'improvement', input: { opportunity: {} } });
    expect(denied.status).toBe(403);
  });
});
