import fs from 'fs';
import path from 'path';
import { decodeJwt } from 'jose';
import { AGENT_ACTOR_TTL_SECONDS, signAgentActorToken } from '../../src/shared/server/utils/JwtUtils';

// packages/contracts/test-vectors/actor-token.json: the agent verifies every vector the same way.
const file = path.resolve(__dirname, '../../../../packages/contracts/test-vectors/actor-token.json');
const contract = JSON.parse(fs.readFileSync(file, 'utf8')) as {
  secret: string;
  max_ttl_seconds: number;
  vectors: { name: string; token: string; valid: boolean; claims?: Record<string, unknown>; signed_by?: string }[];
};

describe('actor token contract', () => {
  const previous = process.env.AGENT_ACTOR_SECRET;
  beforeAll(() => {
    process.env.AGENT_ACTOR_SECRET = contract.secret;
  });
  afterAll(() => {
    process.env.AGENT_ACTOR_SECRET = previous;
  });

  it('signs exactly the web vector', async () => {
    const vector = contract.vectors.find((v) => v.signed_by === 'web');
    const claims = vector?.claims as { sub: string; role: 'owner'; iat: number };
    expect(await signAgentActorToken(Number(claims.sub), claims.role, claims.iat)).toBe(vector?.token);
    expect(decodeJwt(vector!.token)).toEqual(claims);
  });

  it('stays within the contract lifetime', () => {
    expect(AGENT_ACTOR_TTL_SECONDS).toBeGreaterThan(0);
    expect(AGENT_ACTOR_TTL_SECONDS).toBeLessThanOrEqual(contract.max_ttl_seconds);
  });

  it('refuses to sign without a secret', async () => {
    delete process.env.AGENT_ACTOR_SECRET;
    await expect(signAgentActorToken(1, 'owner')).rejects.toThrow('AGENT_ACTOR_SECRET');
    process.env.AGENT_ACTOR_SECRET = contract.secret;
  });
});
