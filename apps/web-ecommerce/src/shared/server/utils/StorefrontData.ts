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
// `key`: the integer id, the public UUID or the SEO slug.
export async function getPublicProduct(key: number | string): Promise<ProductDetail | null | undefined> {
  if (typeof key === 'number' ? !Number.isSafeInteger(key) || key < 1 : !/^[a-z0-9-]{1,120}$/i.test(key)) return null;
  const port = Number(process.env.PORT || 6050);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined;
  try {
    const options: RequestInit & { cache: 'no-store' } = { cache: 'no-store', signal: AbortSignal.timeout(2500) };
    const response = await fetch(`http://127.0.0.1:${port}/api/products/${encodeURIComponent(String(key))}`, options);
    if (response.status === 404) return null;
    if (!response.ok) return undefined;
    const product = await response.json() as ProductDetail;
    return typeof key === 'number' ? (product.id === key ? product : undefined) : product;
  } catch { return undefined; }
}

// The storefront categories (for category landing pages and the sitemap).
export async function getPublicCategories(): Promise<{ id: number; name: string; slug: string; description?: string | null }[]> {
  try {
    const port = Number(process.env.PORT || 6050);
    const options: RequestInit & { cache: 'no-store' } = { cache: 'no-store', signal: AbortSignal.timeout(2500) };
    const response = await fetch(`http://127.0.0.1:${port}/api/categories`, options);
    if (!response.ok) return [];
    const data = await response.json() as unknown;
    const rows = Array.isArray(data) ? data : (data as { payload?: unknown; data?: unknown }).payload ?? (data as { data?: unknown }).data;
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

// Every published product's slug for the sitemap (paged through the public listing).
export async function getPublicProductSlugs(): Promise<{ slug: string; updatedAt?: string }[]> {
  const port = Number(process.env.PORT || 6050);
  const slugs: { slug: string; updatedAt?: string }[] = [];
  try {
    for (let page = 1; page <= 50; page++) {
      const options: RequestInit & { cache: 'no-store' } = { cache: 'no-store', signal: AbortSignal.timeout(4000) };
      const response = await fetch(`http://127.0.0.1:${port}/api/products?per_page=100&page=${page}`, options);
      if (!response.ok) break;
      const result = await response.json() as { payload?: { data?: (ProductSummary & { updatedAt?: string })[]; pagination?: { total_pages?: number } } };
      for (const row of result.payload?.data || []) if (row.slug) slugs.push({ slug: row.slug, updatedAt: row.updatedAt });
      if (page >= (result.payload?.pagination?.total_pages || 1)) break;
    }
  } catch {
    /* A partial sitemap is still useful. */
  }
  return slugs;
}
