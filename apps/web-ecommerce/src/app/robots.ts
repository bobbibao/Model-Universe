import type { MetadataRoute } from 'next';
import { siteUrl } from '@/shared/server/utils/SiteUrl';

export const dynamic = 'force-dynamic';

// /robots.txt: the storefront is public; accounts, checkout, the admin and the API are not for search engines.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/*/admin', '/*/cart', '/*/thank-you', '/*/user-profile', '/*/order-history', '/*/account'],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
