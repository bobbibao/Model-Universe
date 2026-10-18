// The shop's public origin for canonical URLs, Open Graph and the sitemap (SHOP_PUBLIC_URL, no trailing slash).
export const siteUrl = () => (process.env.SHOP_PUBLIC_URL?.trim() || 'http://localhost:6050').replace(/\/+$/, '');
