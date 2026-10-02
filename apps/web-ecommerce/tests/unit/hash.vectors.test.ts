import fs from 'fs';
import path from 'path';
import { canonicalJson, hashAgentRequest } from '../../src/shared/server/utils/AgentApiUtils';

// packages/contracts/test-vectors/hash/request-hash.json: the agent's request_hash asserts the same values.
const file = path.resolve(__dirname, '../../../../packages/contracts/test-vectors/hash/request-hash.json');
const { vectors } = JSON.parse(fs.readFileSync(file, 'utf8')) as {
  vectors: { name: string; endpoint: string; body: unknown; canonical: string; hash: string }[];
};

describe('request hash vectors', () => {
  it.each(vectors.map((v) => [v.name, v]))('%s', (_name, vector) => {
    expect(canonicalJson(vector.body)).toBe(vector.canonical);
    expect(hashAgentRequest(vector.endpoint, vector.body)).toBe(vector.hash);
  });
});
