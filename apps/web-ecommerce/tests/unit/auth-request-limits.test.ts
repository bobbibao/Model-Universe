import express from 'express';
import request from 'supertest';
import { AuthRequestRateLimitMiddleware } from '../../src/core/server/middleware/AuthRequestRateLimit.Middleware';

describe('public authentication request limits', () => {
  it('limits email sends even on successful responses and allows another window', async () => {
    const app = express();
    app.post('/api/auth/forgot-password', AuthRequestRateLimitMiddleware, (_req, res) => res.json({ ok: true }));
    for (let i = 0; i < 10; i++) expect((await request(app).post('/api/auth/forgot-password')).status).toBe(200);
    const blocked = await request(app).post('/api/auth/forgot-password');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 16 * 60_000);
    try { expect((await request(app).post('/api/auth/forgot-password')).status).toBe(200); }
    finally { clock.mockRestore(); }
  });
});
