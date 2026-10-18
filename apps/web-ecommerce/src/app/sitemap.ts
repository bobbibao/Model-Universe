import type { MetadataRoute } from 'next';
import { getPublicCategories, getPublicProductSlugs } from '@/shared/server/utils/StorefrontData';
import { siteUrl } from '@/shared/server/utils/SiteUrl';

// Rendered per request: the catalog changes all the time.
export const dynamic = 'force-dynamic';

// /sitemap.xml: the home page, the catalog, each category and each published product, in both languages (Vietnamese
// first).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const entry = (path: string, priority: number, lastModified?: string): MetadataRoute.Sitemap[number] => ({
    url: `${base}/vi${path}`,
    lastModified: lastModified ? new Date(lastModified) : new Date(),
    priority,
    alternates: { languages: { vi: `${base}/vi${path}`, en: `${base}/en${path}` } },
  });
  const [categories, products] = await Promise.all([getPublicCategories(), getPublicProductSlugs()]);
  return [
    entry('', 1),
    entry('/cua-hang', 0.9),
    ...categories.map((category) => entry(`/cua-hang/${category.slug}`, 0.8)),
    ...products.map((product) => entry(`/san-pham/${product.slug}`, 0.7, product.updatedAt)),
  ];
}
