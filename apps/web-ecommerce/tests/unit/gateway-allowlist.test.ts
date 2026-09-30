import { isAllowed } from '../../src/core/server/services/AgentGatewayService';

const T = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';
const R = '1a2b3c4d-5e6f-7081-92a3-b4c5d6e7f809';

// Every Agent Server route the console and the copilot use, and a sample of what they must never reach.
const ALLOWED: [string, string][] = [
  ['POST', '/threads'],
  ['POST', '/threads/search'],
  ['POST', `/threads/${T}/history`],
  ['POST', `/threads/${T}/runs`],
  ['POST', `/threads/${T}/runs/stream`],
  ['POST', `/threads/${T}/runs/wait`],
  ['POST', `/threads/${T}/runs/${R}/cancel`],
  ['POST', '/runs'],
  ['POST', '/store/items/search'],
  ['POST', '/assistants/search'],
  ['GET', `/threads/${T}`],
  ['GET', `/threads/${T}/state`],
  ['GET', `/threads/${T}/history`],
  ['GET', `/threads/${T}/runs/${R}`],
  ['GET', `/threads/${T}/runs/${R}/join`],
  ['GET', `/threads/${T}/runs/${R}/stream`],
  ['GET', '/store/items'],
  ['GET', `/assistants/improvement/schemas`],
];

const DENIED: [string, string][] = [
  ['DELETE', `/threads/${T}`],
  ['PATCH', `/threads/${T}`],
  ['POST', `/threads/${T}/state`], // editing a thread's state
  ['PUT', '/store/items'],
  ['DELETE', '/store/items'],
  ['POST', '/runs/crons'],
  ['POST', '/runs/crons/search'],
  ['POST', '/runs/wait'],
  ['POST', '/runs/stream'],
  ['POST', '/assistants'],
  ['GET', '/info'],
  ['GET', '/mcp'],
  ['POST', '/mcp'],
  ['GET', `/threads/${T}/runs`],
  ['GET', `/threads/../runs/crons`],
  ['POST', `/threads/${T}/runs/${R}/cancel/extra`],
];

describe('gateway allowlist', () => {
  it.each(ALLOWED)('allows %s %s', (method, path) => expect(isAllowed(method, path)).toBe(true));
  it.each(DENIED)('denies %s %s', (method, path) => expect(isAllowed(method, path)).toBe(false));
});
