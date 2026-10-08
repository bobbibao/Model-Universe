import type { ProductSummary } from '../../types/product';

// Public catalog only. The custom Express server owns database initialization and the existing product endpoint.
// Never derive this origin from an incoming Host header or forward account cookies to it.
export async function getFeaturedProducts(): Promise<ProductSummary[] | undefined> {
  try {
    const port = Number(process.env.PORT || 6050);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined;
    const options: RequestInit & { cache: 'no-store' } = {
      cache: 'no-store', signal: AbortSignal.timeout(2500),
    };
    const response = await fetch(`http://127.0.0.1:${port}/api/products?featured=true&per_page=8`, options);
    if (!response.ok) return undefined;
    const result = await response.json() as { payload?: { data?: ProductSummary[] } };
    return Array.isArray(result.payload?.data) ? result.payload.data : undefined;
  } catch {
    return undefined;
  }
}
