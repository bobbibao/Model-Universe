jest.mock('@langchain/langgraph-sdk', () => ({ Client: jest.fn() }));
jest.mock('react-toastify', () => ({ toast: { error: jest.fn() } }));

import { Client } from '@langchain/langgraph-sdk';
import { toast } from 'react-toastify';
import AgentServerApi from '../../src/core/client/api/AgentServer';

describe('agent thread transport failures', () => {
  const get = jest.fn();
  const getState = jest.fn();
  beforeEach(() => {
    jest.resetAllMocks();
    global.window = { location: { origin: 'http://store.example.test' } } as Window & typeof globalThis;
    jest.mocked(Client).mockImplementation(() => ({ threads: { get, getState } }) as never);
    getState.mockResolvedValue({ tasks: [], values: {} });
  });
  afterAll(() => { delete (global as { window?: unknown }).window; });
  it('bounds thread reads and does not automatically replay failed operations', async () => {
    get.mockRejectedValue(Object.assign(new Error('HTTP 503 for thread 404-fixture'), { status: 503 }));
    expect(await AgentServerApi.getImprovement('404-fixture')).toBeUndefined();
    expect(Client).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 10000, callerOptions: { maxRetries: 0 } }));
    expect(get).toHaveBeenCalledTimes(1);
  });
  it('distinguishes a real missing thread from service failure containing a 404-like identifier', async () => {
    get.mockRejectedValue(Object.assign(new Error('HTTP 404'), { status: 404 }));
    expect(await AgentServerApi.getImprovement('missing')).toBeNull();
  });
  it('keeps the visible outage notification in the screen language', async () => {
    get.mockRejectedValue(Object.assign(new Error('HTTP 503'), { status: 503 }));
    await AgentServerApi.getImprovement('unavailable', 'The proposal could not be loaded.');
    expect(toast.error).toHaveBeenCalledWith('The proposal could not be loaded.');
  });
  it('allows an explicit retry to load a recovered thread', async () => {
    get.mockRejectedValueOnce(Object.assign(new Error('Unavailable'), { status: 503 }));
    get.mockResolvedValueOnce({ thread_id: 'recovered', metadata: {}, values: { stage: 'closed' } });
    expect(await AgentServerApi.getImprovement('recovered')).toBeUndefined();
    expect(await AgentServerApi.getImprovement('recovered')).toMatchObject({ thread: { thread_id: 'recovered' }, review: null });
    expect(get).toHaveBeenCalledTimes(2);
  });
});
