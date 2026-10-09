describe('agent header reads during outages and account switches', () => {
  const originalFetch = global.fetch;
  let read: typeof import('../../src/core/client/api/AgentInboxApi').countPendingReviews;
  let fetchMock: jest.Mock;
  beforeEach(async () => {
    jest.resetModules();
    jest.useFakeTimers();
    fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
    read = (await import('../../src/core/client/api/AgentInboxApi')).countPendingReviews;
  });
  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('coalesces concurrent remounts and preserves unknown status after an outage', async () => {
    fetchMock.mockRejectedValue(new Error('Fixture agent service unavailable'));
    expect(await Promise.all([read(10), read(10), read(10)])).toEqual([null, null, null]);
    expect(await read(10)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/agent/server/threads/search');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      metadata: { graph: 'improvement' },
      status: 'interrupted',
      limit: 50,
      select: ['thread_id'],
    });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin', method: 'POST' });
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
    jest.advanceTimersByTime(60_001);
    fetchMock.mockResolvedValue({ ok: true, json: async () => [{ thread_id: 'fixture-review' }] });
    expect(await read(10)).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('does not reuse another administrator count after an account switch', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [{ thread_id: 'a' }, { thread_id: 'b' }] });
    expect(await read(10)).toBe(2);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    expect(await read(11)).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('keeps authentication errors and malformed upstream responses unknown', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });
    expect(await read(10)).toBeNull();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'fixture unavailable' }) });
    expect(await read(11)).toBeNull();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [{ message: 'fixture malformed thread' }] });
    expect(await read(12)).toBeNull();
  });
});
