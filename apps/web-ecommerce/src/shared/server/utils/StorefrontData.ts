import type { ProductDetail, ProductSummary } from '../../types/product';

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

// Reuse the actual public endpoint; never send credentials or import database models into route bundles.
export async function getPublicProduct(id: number): Promise<ProductDetail | null | undefined> {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const port = Number(process.env.PORT || 6050);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined;
  try {
    const options: RequestInit & { cache: 'no-store' } = { cache: 'no-store', signal: AbortSignal.timeout(2500) };
    const response = await fetch(`http://127.0.0.1:${port}/api/products/${id}`, options);
    if (response.status === 404) return null;
    if (!response.ok) return undefined;
    const product = await response.json() as ProductDetail;
    return product.id === id ? product : undefined;
  } catch { return undefined; }
}
