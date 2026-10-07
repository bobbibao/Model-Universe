/* Regenerates packages/contracts/test-vectors/ from this app's own code (`yarn test-vectors`).
 *
 * The agent (apps/agent-service tests/contract) and this app's Jest suite both assert these files, so a change on
 * either side that breaks the other fails a test. Run it only when the contract changes on purpose.
 */
import fs from 'fs';
import path from 'path';
import { SignJWT } from 'jose';
import { canonicalJson, hashAgentRequest } from '../src/shared/server/utils/AgentApiUtils';
import {
  AGENT_ACTOR_AUDIENCE,
  AGENT_ACTOR_ISSUER,
  AGENT_ACTOR_TTL_SECONDS,
  signAgentActorToken,
} from '../src/shared/server/utils/JwtUtils';

const VECTORS_DIR = path.resolve(__dirname, '../../../packages/contracts/test-vectors');

export const ACTOR_SECRET = 'contract-test-actor-secret-0123456789abcdef';
export const ACTOR_NOW = 1790000000;

const write = (file: string, data: unknown) => {
  const target = path.join(VECTORS_DIR, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`wrote ${path.relative(process.cwd(), target)}`);
};

// ------------------------------------------------------------------ request hashes (approval grants bind them)

const hashVectors = () => {
  const file = path.join(VECTORS_DIR, 'hash', 'request-hash.json');
  const current = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    vectors: { name: string; endpoint: string; body: unknown }[];
  };
  write('hash/request-hash.json', {
    description:
      'Request hashes computed by apps/web-ecommerce hashAgentRequest (sha256 of endpoint + "\\n" + canonicalJson(body)). ' +
      "The agent's shop_agent.domain.approval.request_hash must produce the same values.",
    vectors: current.vectors.map(({ name, endpoint, body }) => ({
      name,
      endpoint,
      body,
      canonical: canonicalJson(body),
      hash: hashAgentRequest(endpoint, body),
    })),
  });
};

// ------------------------------------------------------------------ actor tokens (web -> Agent Server)

const raw = (claims: Record<string, unknown>, secret = ACTOR_SECRET) =>
  new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(secret));

const base = { iss: AGENT_ACTOR_ISSUER, aud: AGENT_ACTOR_AUDIENCE, iat: ACTOR_NOW, exp: ACTOR_NOW + 60 };

const actorVectors = async () => {
  process.env.AGENT_ACTOR_SECRET = ACTOR_SECRET;
  const owner = await signAgentActorToken(7, 'owner', ACTOR_NOW);
  const ownerClaims = {
    typ: 'agent_actor',
    role: 'owner',
    iss: AGENT_ACTOR_ISSUER,
    aud: AGENT_ACTOR_AUDIENCE,
    sub: '7',
    iat: ACTOR_NOW,
    exp: ACTOR_NOW + AGENT_ACTOR_TTL_SECONDS,
  };
  const exp = ACTOR_NOW + AGENT_ACTOR_TTL_SECONDS;
  write('actor-token.json', {
    description:
      'Actor tokens (web gateway -> Agent Server). HS256 with AGENT_ACTOR_SECRET; claims typ=agent_actor, role in ' +
      '{staff, manager, owner, system, customer}, iss, aud, sub, iat, exp with exp - iat <= max_ttl_seconds; checked with ' +
      'leeway_seconds at `now`. The first vector is exactly what apps/web-ecommerce signAgentActorToken produces.',
    secret: ACTOR_SECRET,
    issuer: AGENT_ACTOR_ISSUER,
    audience: AGENT_ACTOR_AUDIENCE,
    max_ttl_seconds: 300,
    leeway_seconds: 10,
    vectors: [
      { name: 'web-owner', token: owner, now: ACTOR_NOW + 30, valid: true, claims: ownerClaims, signed_by: 'web' },
      {
        name: 'web-customer',
        token: await signAgentActorToken('user:7', 'customer', ACTOR_NOW),
        now: ACTOR_NOW + 30,
        valid: true,
        claims: { ...ownerClaims, role: 'customer', sub: 'user:7' },
        signed_by: 'web',
      },
      {
        name: 'web-guest',
        token: await signAgentActorToken('guest:test-session', 'customer', ACTOR_NOW),
        now: ACTOR_NOW + 30,
        valid: true,
        claims: { ...ownerClaims, role: 'customer', sub: 'guest:test-session' },
        signed_by: 'web',
      },
      { name: 'within-leeway', token: owner, now: exp + 5, valid: true, claims: ownerClaims },
      { name: 'expired', token: owner, now: exp + 11, valid: false },
      {
        name: 'system',
        token: await raw({ typ: 'agent_actor', role: 'system', sub: 'system', ...base }),
        now: ACTOR_NOW,
        valid: true,
        claims: { typ: 'agent_actor', role: 'system', sub: 'system', ...base },
      },
      {
        name: 'wrong-audience',
        token: await raw({ typ: 'agent_actor', role: 'owner', sub: '7', ...base, aud: 'ci-agent' }),
        now: ACTOR_NOW,
        valid: false,
      },
      {
        name: 'v1-token-type',
        token: await raw({ typ: 'ci_actor', ci_role: 'owner', sub: '7', ...base }),
        now: ACTOR_NOW,
        valid: false,
      },
      {
        name: 'unknown-role',
        token: await raw({ typ: 'agent_actor', role: 'admin', sub: '7', ...base }),
        now: ACTOR_NOW,
        valid: false,
      },
      {
        name: 'lives-too-long',
        token: await raw({ typ: 'agent_actor', role: 'owner', sub: '7', ...base, exp: ACTOR_NOW + 600 }),
        now: ACTOR_NOW,
        valid: false,
      },
      {
        name: 'wrong-secret',
        token: await raw({ typ: 'agent_actor', role: 'owner', sub: '7', ...base }, `${ACTOR_SECRET}-other`),
        now: ACTOR_NOW,
        valid: false,
      },
      {
        name: 'issued-in-the-future',
        token: await raw({
          typ: 'agent_actor',
          role: 'owner',
          sub: '7',
          ...base,
          iat: ACTOR_NOW + 60,
          exp: ACTOR_NOW + 120,
        }),
        now: ACTOR_NOW,
        valid: false,
      },
    ],
  });
};

if (require.main === module) {
  hashVectors();
  actorVectors().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
