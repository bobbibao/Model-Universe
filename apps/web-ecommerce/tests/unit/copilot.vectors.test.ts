import fs from 'fs';
import path from 'path';
import { hashAgentRequest } from '../../src/shared/server/utils/AgentApiUtils';
import { COPILOT_TOOLS, copilotRequest } from '../../src/shared/server/utils/CopilotToolUtils';

// packages/contracts/test-vectors/copilot/write-tools.json: the agent's `write_request` asserts the same requests.
const file = path.resolve(__dirname, '../../../../packages/contracts/test-vectors/copilot/write-tools.json');
const { cases } = JSON.parse(fs.readFileSync(file, 'utf8')) as {
  cases: {
    tool: string;
    args: Record<string, unknown>;
    endpoint: string;
    body: Record<string, unknown>;
    body_hash: string;
    editable_fields: string[];
    protective: boolean;
  }[];
};

describe('copilot write tool vectors', () => {
  it('covers every copilot write tool', () => {
    expect(cases.map((c) => c.tool).sort()).toEqual(Object.keys(COPILOT_TOOLS).sort());
  });

  it.each(cases.map((c) => [c.tool, c]))('%s', (_tool, vector) => {
    const request = copilotRequest(vector.tool, vector.args);
    expect(request?.endpoint).toBe(vector.endpoint);
    expect(hashAgentRequest(request!.endpoint, request!.body)).toBe(vector.body_hash);
    expect(hashAgentRequest(vector.endpoint, vector.body)).toBe(vector.body_hash);
    expect(COPILOT_TOOLS[vector.tool].editable).toEqual(vector.editable_fields);
    expect(COPILOT_TOOLS[vector.tool].protective).toBe(vector.protective);
  });
});
