import crypto from 'crypto';
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';
import { UniqueConstraintError } from 'sequelize';
import UserModel from '../database/internal/models/User.Model';
import { hashPassword } from '../../../shared/server/utils/PasswordUtils';
import { signSessionToken } from '../../../shared/server/utils/JwtUtils';
import { isValidEmail, normalizeEmail } from '../../../shared/server/utils/ValidationUtils';
import HttpError from '../../../shared/server/utils/HttpError';
import { toPublicUser } from './UserService';
import { shopOrigin } from '../../../shared/server/utils/ShopOrigin';

const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export const GOOGLE_FLOW_COOKIE = 'google_auth_flow';
const secret = () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  return new TextEncoder().encode(process.env.JWT_SECRET);
};
export const googleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const config = () => {
  if (!googleEnabled()) throw HttpError.badRequest('Đăng nhập Google chưa được cấu hình.');
  return {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri: `${shopOrigin()}/api/auth/google/callback`,
  };
};
export const safeAuthRedirect = (value: unknown, fallback: string) => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.includes('\\') ||
    [...value].some((character) => character.charCodeAt(0) <= 32) || value.startsWith('//'))
    return fallback;
  return value;
};

export default class GoogleAuthService {
  async start(localeValue: unknown, redirectValue: unknown) {
    const { clientId, redirectUri } = config();
    const locale = localeValue === 'en' ? 'en' : 'vi';
    const state = crypto.randomBytes(32).toString('base64url');
    const nonce = crypto.randomBytes(32).toString('base64url');
    const verifier = crypto.randomBytes(32).toString('base64url');
    const redirect = safeAuthRedirect(redirectValue, '');
    const flow = await new SignJWT({ typ: 'google_flow', state, nonce, verifier, redirect, locale })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(secret());
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();
    return { flow, url: url.toString() };
  }

  async finish(flow: unknown, state: unknown, code: unknown) {
    if (typeof flow !== 'string' || typeof state !== 'string' || typeof code !== 'string')
      throw HttpError.badRequest('Phiên đăng nhập Google đã hết hạn.');
    const { payload } = await jwtVerify(flow, secret(), { algorithms: ['HS256'] });
    if (
      payload.typ !== 'google_flow' ||
      payload.state !== state ||
      typeof payload.verifier !== 'string' ||
      typeof payload.nonce !== 'string'
    )
      throw HttpError.badRequest('Phiên đăng nhập Google không hợp lệ.');
    const { clientId, clientSecret, redirectUri } = config();
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
        code_verifier: payload.verifier,
        grant_type: 'authorization_code',
      }),
    });
    if (!response.ok) throw HttpError.badRequest('Không thể xác thực tài khoản Google.');
    const tokens = (await response.json()) as { id_token?: unknown };
    if (!tokens || typeof tokens.id_token !== 'string')
      throw HttpError.badRequest('Google không trả về thông tin xác thực.');
    const { payload: identity } = await jwtVerify(tokens.id_token, keys, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: clientId,
      algorithms: ['RS256'],
      requiredClaims: ['sub', 'exp', 'iat', 'email', 'email_verified', 'nonce'],
    });
    if (
      identity.nonce !== payload.nonce ||
      identity.email_verified !== true ||
      !identity.sub ||
      (identity.azp !== undefined && identity.azp !== clientId)
    )
      throw HttpError.badRequest('Email Google chưa được xác thực.');
    const email = normalizeEmail(identity.email);
    if (!isValidEmail(email)) throw HttpError.badRequest('Email Google không hợp lệ.');
    let user = await UserModel.findOne({ where: { googleSubject: identity.sub } });
    if (!user) {
      user = await UserModel.findOne({ where: { email } });
      if (user) {
        // Google is authoritative for Gmail / Workspace, not third-party email addresses.
        const authoritative =
          email.endsWith('@gmail.com') || (typeof identity.hd === 'string' && identity.hd.length > 0);
        if (!authoritative || (user.googleSubject && user.googleSubject !== identity.sub))
          throw HttpError.conflict('Email đã có tài khoản. Vui lòng đăng nhập bằng mật khẩu.');
        if (!user.isActive) throw HttpError.forbidden('Tài khoản của bạn đã bị khoá.');
        // Conditional update prevents two identities racing to bind the same account.
        const [updated] = await UserModel.update(
          { googleSubject: identity.sub },
          { where: { id: user.id, googleSubject: null } },
        );
        if (!updated) throw HttpError.conflict('Vui lòng thử đăng nhập lại.');
      } else {
        try {
          user = await UserModel.create({
            email,
            googleSubject: identity.sub,
            // An unguessable password keeps the existing non-null schema; email recovery can set a usable password.
            passwordHash: await hashPassword(crypto.randomBytes(48).toString('base64url')),
            firstName: typeof identity.given_name === 'string' ? identity.given_name.slice(0, 255) : 'Khách hàng',
            lastName: typeof identity.family_name === 'string' ? identity.family_name.slice(0, 255) : '',
            role: 'USER',
            isActive: true,
          });
        } catch (error) {
          if (error instanceof UniqueConstraintError)
            throw HttpError.conflict('Tài khoản vừa được cập nhật. Vui lòng đăng nhập lại.');
          throw error;
        }
      }
    }
    if (!user.isActive) throw HttpError.forbidden('Tài khoản của bạn đã bị khoá.');
    const locale = payload.locale === 'en' ? 'en' : 'vi';
    return {
      user: toPublicUser(user),
      token: await signSessionToken(user.id, user.role, undefined, user.sessionVersion),
      redirect: safeAuthRedirect(payload.redirect, `/${locale}${user.role === 'ADMIN' ? '/admin/dashboard' : '/'}`),
    };
  }
}
