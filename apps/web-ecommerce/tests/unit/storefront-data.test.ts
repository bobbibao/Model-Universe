import { getFeaturedProducts, getPublicProduct } from '../../src/shared/server/utils/StorefrontData';

describe('public server-rendered catalog boundary', () => {
  const originalPort = process.env.PORT;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  beforeEach(() => { process.env.PORT = '6052'; fetchMock = jest.spyOn(globalThis, 'fetch'); });
  afterEach(() => { jest.restoreAllMocks(); if (originalPort === undefined) delete process.env.PORT; else process.env.PORT = originalPort; });
  it('reads only the local public endpoint without credentials and never caches observed stock', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 42, stock: 1 }), { status: 200 }));
    expect(await getPublicProduct(42)).toEqual({ id: 42, stock: 1 });
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:6052/api/products/42', expect.objectContaining({ cache: 'no-store' }));
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('headers'); expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('credentials');
  });
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])('rejects invalid product identifiers before network access (%s)', async id => {
    expect(await getPublicProduct(id)).toBeNull(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('distinguishes archived/unavailable merchandise from a transient service outage', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 })).mockResolvedValueOnce(new Response('', { status: 503 })).mockRejectedValueOnce(new Error('Temporary network outage'));
    expect(await getPublicProduct(42)).toBeNull(); expect(await getPublicProduct(42)).toBeUndefined(); expect(await getPublicProduct(42)).toBeUndefined();
  });
  it('refuses wrong product responses and an invalid configured port', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 43 }), { status: 200 }));
    expect(await getPublicProduct(42)).toBeUndefined(); process.env.PORT = '65536';
    expect(await getPublicProduct(42)).toBeUndefined(); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('returns only real featured rows from the existing list envelope', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ payload: { data: [{ id: 42 }] } }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    expect(await getFeaturedProducts()).toEqual([{ id: 42 }]); expect(await getFeaturedProducts()).toBeUndefined();
  });
});
