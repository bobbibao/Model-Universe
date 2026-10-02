import fs from 'fs';
import path from 'path';
import { AGENT_SETTING_DEFAULTS, validateAgentSetting } from '../../src/core/server/services/AgentSettingDefinitions';

// packages/contracts/test-vectors/agent-settings.json: the agent parses the same keys with the same defaults.
const vectors = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../packages/contracts/test-vectors/agent-settings.json'), 'utf-8'),
);

describe('agent settings defaults (contract)', () => {
  it('are exactly the contract defaults', () => {
    expect(AGENT_SETTING_DEFAULTS).toEqual(vectors.defaults);
  });

  it.each(Object.keys(vectors.defaults))('default of %s passes validation unchanged', (key) => {
    const { value, errors } = validateAgentSetting(key as keyof typeof AGENT_SETTING_DEFAULTS, vectors.defaults[key]);
    expect(errors).toEqual([]);
    expect(value).toEqual(vectors.defaults[key]);
  });
});
