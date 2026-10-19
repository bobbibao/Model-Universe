import 'reflect-metadata';
import crypto from 'crypto';
import { Sequelize } from 'sequelize-typescript';
import { exportJWK, generateKeyPair, SignJWT, jwtVerify } from 'jose';
import nock from 'nock';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import UserModel from '../../src/core/server/database/internal/models/User.Model';
import EmailVerificationModel from '../../src/core/server/database/internal/models/EmailVerification.Model';
import PasswordResetService from '../../src/core/server/services/PasswordResetService';
import GoogleAuthService from '../../src/core/server/services/GoogleAuthService';
import MailService from '../../src/core/server/services/MailService';
import AuthService from '../../src/core/server/services/AuthService';
import { hashPassword, verifyPassword } from '../../src/shared/server/utils/PasswordUtils';
import { signSessionToken } from '../../src/shared/server/utils/JwtUtils';
import { AuthenticationMiddleware } from '../../src/core/server/middleware/Authentication.Middleware';
import { MIGRATIONS } from '../../src/core/server/database/migrations';
import { useTestDatabase } from './support/testDb';

describe('authentication recovery and Google (isolated Postgres)', () => {
  let db: Sequelize;
  let user: UserModel;
  const reset = new PasswordResetService();
  const google = new GoogleAuthService();
  const mail = jest.spyOn(MailService.prototype, 'sendTransactional');
  let key: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwk: Awaited<ReturnType<typeof exportJWK>>;
  beforeAll(async () => {
    useTestDatabase();
    process.env.JWT_SECRET = 'auth-test-secret-only-012345678901234567890';
    process.env.SHOP_PUBLIC_URL = 'http://localhost:6050';
    process.env.GOOGLE_CLIENT_ID = 'test-client';
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
    db = new Sequelize({
      dialect: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      models: [UserModel, EmailVerificationModel],
      logging: false,
    });
    await db.sync({ force: true });
    key = await generateKeyPair('RS256');
    jwk = { ...(await exportJWK(key.publicKey)), kid: 'auth-test-key', alg: 'RS256', use: 'sig' };
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });
  beforeEach(async () => {
    nock.cleanAll();
    mail.mockReset();
    mail.mockResolvedValue('test-mail');
    await EmailVerificationModel.destroy({ where: {} });
    await UserModel.destroy({ where: {} });
    user = await UserModel.create({
      email: 'customer@gmail.com',
      firstName: 'Test',
      lastName: 'User',
      passwordHash: await hashPassword('original-password'),
      isActive: true,
      role: 'USER',
    });
  });
  afterAll(async () => {
    nock.cleanAll();
    nock.enableNetConnect();
    mail.mockRestore();
    await db.close();
  });

  const resetToken = () => {
    const text = String(mail.mock.calls[0][2]);
    return text.match(/#token=([a-f0-9]{64})/)![1];
  };
  const sessionApp = () => {
    const app = express();
    app.use(cookieParser());
    app.use('/api', AuthenticationMiddleware);
    app.get('/api/orders', (_req, res) => res.json({ ok: true }));
    return app;
  };

  it('upgrades the old user schema idempotently without changing accounts', async () => {
    await db.getQueryInterface().removeColumn('user', 'googleSubject');
    await db.getQueryInterface().removeColumn('user', 'sessionVersion');
    const migration = MIGRATIONS.find((m) => m.name === '2026-10-20-auth-recovery-google')!;
    await migration.up({ context: { sequelize: db } } as never);
    await migration.up({ context: { sequelize: db } } as never);
    expect((await UserModel.findByPk(user.id))?.sessionVersion).toBe(0);
  });

  it('sends a localized link, stores only a digest, and throttles concurrent resends', async () => {
    await Promise.all([reset.request(' CUSTOMER@gmail.com ', 'en'), reset.request('customer@gmail.com', 'en')]);
    expect(mail).toHaveBeenCalledTimes(1);
    expect(mail.mock.calls[0][2]).toContain('/en/auth/reset-password#token=');
    const token = resetToken();
    const record = (await EmailVerificationModel.findOne())!;
    expect(record.otpHash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
    expect(record.otpHash).not.toBe(token);
  });

  it('returns the same result for missing or locked accounts without sending email', async () => {
    await user.update({ isActive: false });
    await expect(reset.request(user.email, 'vi')).resolves.toBeUndefined();
    await expect(reset.request('missing@example.com', 'vi')).resolves.toBeUndefined();
    expect(mail).not.toHaveBeenCalled();
  });

  it('consumes a link once, changes the hash and revokes old sessions', async () => {
    const old = await signSessionToken(user.id, user.role);
    const app = sessionApp();
    expect((await request(app).get('/api/orders').set('Cookie', `access_token=${old}`)).status).toBe(200);
    await reset.request(user.email, 'vi');
    const token = resetToken();
    const outcomes = await Promise.allSettled([
      reset.reset(token, 'new-password', 'new-password'),
      reset.reset(token, 'new-password', 'new-password'),
    ]);
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const updated = (await UserModel.scope('withPassword').findByPk(user.id))!;
    expect(await verifyPassword('new-password', updated.passwordHash)).toBe(true);
    expect(updated.sessionVersion).toBe(1);
    expect((await request(app).get('/api/orders').set('Cookie', `access_token=${old}`)).status).toBe(401);
    const login = await new AuthService().login(user.email, 'new-password');
    expect((await request(app).get('/api/orders').set('Cookie', `access_token=${login.token}`)).status).toBe(200);
  });

  it('rejects expired links and mismatched passwords without consuming a valid link', async () => {
    await reset.request(user.email, 'vi');
    const token = resetToken();
    await expect(reset.reset(token, 'new-password', 'different')).rejects.toThrow();
    expect(await EmailVerificationModel.count()).toBe(1);
    await EmailVerificationModel.update({ expiresAt: new Date(0) }, { where: {} });
    await expect(reset.reset(token, 'new-password', 'new-password')).rejects.toThrow();
    expect((await UserModel.findByPk(user.id))?.sessionVersion).toBe(0);
  });

  it('hides email delivery errors and allows retry after failure', async () => {
    mail.mockRejectedValueOnce(new Error('SMTP down'));
    await expect(reset.request(user.email, 'vi')).resolves.toBeUndefined();
    expect(await EmailVerificationModel.count()).toBe(0);
    await reset.request(user.email, 'vi');
    expect(mail).toHaveBeenCalledTimes(2);
  });

  const prepareGoogle = async (claims: Record<string, unknown> = {}) => {
    const start = await google.start('en', '/en/cart');
    const url = new URL(start.url);
    const { payload: flow } = await jwtVerify(start.flow, new TextEncoder().encode(process.env.JWT_SECRET));
    expect(url.searchParams.get('code_challenge')).toBe(
      crypto.createHash('sha256').update(String(flow.verifier)).digest('base64url'),
    );
    const idToken = await new SignJWT({
      email: user.email,
      email_verified: true,
      nonce: flow.nonce,
      given_name: 'Google',
      ...claims,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'auth-test-key' })
      .setSubject('google-user-123')
      .setIssuer('https://accounts.google.com')
      .setAudience('test-client')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key.privateKey);
    nock('https://www.googleapis.com')
      .get('/oauth2/v3/certs')
      .reply(200, { keys: [jwk] });
    nock('https://oauth2.googleapis.com').post('/token').reply(200, { id_token: idToken });
    return { ...start, state: url.searchParams.get('state')! };
  };

  it('binds a verified Gmail account, preserves its role, and issues a normal session', async () => {
    const flow = await prepareGoogle();
    const result = await google.finish(flow.flow, flow.state, 'test-code');
    expect(result.redirect).toBe('/en/cart');
    expect(result.user.id).toBe(user.id);
    expect(result.user).not.toHaveProperty('googleSubject');
    expect(result.user).not.toHaveProperty('sessionVersion');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect((await UserModel.findByPk(user.id))?.googleSubject).toBe('google-user-123');
    expect((await request(sessionApp()).get('/api/orders').set('Cookie', `access_token=${result.token}`)).status).toBe(
      200,
    );
  });

  it('creates a customer for a new verified Google identity', async () => {
    const flow = await prepareGoogle({ email: 'new-customer@gmail.com' });
    const result = await google.finish(flow.flow, flow.state, 'test-code');
    expect(result.user.role).toBe('USER');
    expect(result.user.email).toBe('new-customer@gmail.com');
    expect(await UserModel.count()).toBe(2);
  });

  it.each([{ email_verified: false }, { nonce: 'wrong-nonce' }, { email: 'not-an-email' }])(
    'rejects untrusted Google claims %j',
    async (claims) => {
      const flow = await prepareGoogle(claims);
      await expect(google.finish(flow.flow, flow.state, 'test-code')).rejects.toThrow();
      expect((await UserModel.findByPk(user.id))?.googleSubject).toBeNull();
    },
  );

  it('rejects state tampering before exchanging any code', async () => {
    const flow = await google.start('vi', '//evil.example');
    await expect(google.finish(flow.flow, 'tampered', 'code')).rejects.toThrow();
  });

  it('does not auto-link a third-party email or sign in a locked account', async () => {
    await user.update({ email: 'customer@example.com' });
    let flow = await prepareGoogle();
    await expect(google.finish(flow.flow, flow.state, 'code')).rejects.toThrow();
    await user.update({ email: 'customer@gmail.com', isActive: false });
    flow = await prepareGoogle();
    await expect(google.finish(flow.flow, flow.state, 'code')).rejects.toThrow();
  });
});
