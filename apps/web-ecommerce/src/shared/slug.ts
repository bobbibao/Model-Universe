// URL slugs for Vietnamese text (SEO-friendly product and category paths): accents removed, đ → d, lowercase words
// joined by hyphens. "Motor Nuclear Hạng Vũ — Bản A" → "motor-nuclear-hang-vu-ban-a".
export const slugify = (text: string, maxLength = 90): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// The storefront paths (the locale prefix is added by the navigation helpers). Vietnamese words first: the shop's
// customers search in Vietnamese. Products without a slug yet fall back to the id path, which redirects.
export const productPath = (product: { id: number; slug?: string | null }) =>
  product.slug ? `/san-pham/${product.slug}` : `/shop/product/${product.id}`;
export const shopPath = (categorySlug?: string | null) => (categorySlug ? `/cua-hang/${categorySlug}` : '/cua-hang');
