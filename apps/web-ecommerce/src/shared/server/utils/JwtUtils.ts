import { SignJWT, jwtVerify, JWTPayload } from 'jose';

// Only depends on `jose` so it can run in both the Express server and the Next.js edge middleware.

export const AUTH_COOKIE_NAME = 'access_token';

export type UserRole = 'USER' | 'ADMIN';

export interface SessionClaims extends JWTPayload {
  sub: string;
  role: UserRole;
  typ: 'session';
}

export interface RegistrationClaims extends JWTPayload {
  email: string;
  typ: 'registration';
}

const DEFAULT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const getSecret = (): Uint8Array => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return new TextEncoder().encode(secret);
};

export const getSessionTtlSeconds = (): number => {
  const ttl = Number(process.env.JWT_EXPIRES_IN);
  return Number.isInteger(ttl) && ttl > 0 ? ttl : DEFAULT_SESSION_TTL_SECONDS;
};

const sign = (claims: JWTPayload, ttlSeconds: number, subject?: string): Promise<string> => {
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`);
  if (subject) jwt.setSubject(subject);
  return jwt.sign(getSecret());
};

export const signSessionToken = (userId: number, role: UserRole): Promise<string> =>
  sign({ role, typ: 'session' }, getSessionTtlSeconds(), String(userId));

export const signRegistrationToken = (email: string, ttlSeconds: number): Promise<string> =>
  sign({ email, typ: 'registration' }, ttlSeconds);

const verify = async (token: string): Promise<JWTPayload | null> => {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
    return payload;
  } catch {
    return null;
  }
};

export const verifySessionToken = async (token: string | undefined): Promise<SessionClaims | null> => {
  if (!token) return null;
  const payload = await verify(token);
  return payload?.typ === 'session' && payload.sub ? (payload as SessionClaims) : null;
};

export const verifyRegistrationToken = async (token: string | undefined): Promise<RegistrationClaims | null> => {
  if (!token) return null;
  const payload = await verify(token);
  return payload?.typ === 'registration' && typeof payload.email === 'string' ? (payload as RegistrationClaims) : null;
};

// Role of a person at the Agent Server (packages/contracts/test-vectors/actor-token.json; the agent also has the
// `system` role for its own calls, which the web never signs).
export type AgentRole = 'staff' | 'manager' | 'owner';

// The contract allows at most 300 s; the gateway signs one token per request.
export const AGENT_ACTOR_TTL_SECONDS = 60;
export const AGENT_ACTOR_ISSUER = 'web-ecommerce';
export const AGENT_ACTOR_AUDIENCE = 'shop-agent';

// Short-lived token proving to the Agent Server which user is acting (verified by apps/agent-service
// src/shop_agent/auth.py). It is signed with AGENT_ACTOR_SECRET, never JWT_SECRET, so the agent can check who acts
// but cannot mint web sessions. `now` (seconds) is for the contract's test vectors.
export const signAgentActorToken = async (
  userId: number | string,
  role: AgentRole,
  now: number = Math.floor(Date.now() / 1000),
): Promise<string> => {
  const secret = process.env.AGENT_ACTOR_SECRET;
  if (!secret) throw new Error('AGENT_ACTOR_SECRET is not configured');
  return new SignJWT({ typ: 'agent_actor', role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(AGENT_ACTOR_ISSUER)
    .setAudience(AGENT_ACTOR_AUDIENCE)
    .setSubject(String(userId))
    .setIssuedAt(now)
    .setExpirationTime(now + AGENT_ACTOR_TTL_SECONDS)
    .sign(new TextEncoder().encode(secret));
};

// Options for the httpOnly session cookie. Secure by default in production (override with COOKIE_SECURE=false for plain HTTP).
export const getAuthCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: getSessionTtlSeconds() * 1000,
});
