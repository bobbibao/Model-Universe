import nock from 'nock';
import request from 'supertest';
import { AGENT_SERVER, gatewayApp } from './support/gatewayApp';

const T = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';
const R = '1a2b3c4d-5e6f-7081-92a3-b4c5d6e7f809';

describe('gateway streams', () => {
  let app: Awaited<ReturnType<typeof gatewayApp>>;
  beforeAll(async () => {
    app = await gatewayApp();
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });
  afterAll(() => nock.enableNetConnect());

  it('relays server-sent events unbuffered and unchanged', async () => {
    const events = 'event: metadata\ndata: {"run_id":"r1"}\n\nevent: values\ndata: {"stage":"reviewing"}\n\n';
    nock(AGENT_SERVER)
      .get(`/threads/${T}/runs/${R}/stream`)
      .reply(200, events, { 'Content-Type': 'text/event-stream' });
    const res = await request(app)
      .get(`/api/admin/agent/server/threads/${T}/runs/${R}/stream`)
      .set('x-test-role', 'ADMIN')
      .buffer(true)
      .parse((response, done) => {
        let text = '';
        response.on('data', (chunk: Buffer) => (text += chunk.toString()));
        response.on('end', () => done(null, text));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['x-accel-buffering']).toBe('no');
    expect(res.body).toBe(events);
  });
});
