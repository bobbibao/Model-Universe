'use client';

import type { ProductSummary } from '@/shared/types/product';

// The last products this visitor opened, kept only in their browser so the home page can bring them back. Storage may
// be unavailable (private mode, blocked site data): every access is guarded and the feature simply stays empty.
const KEY = 'model-universe.recently-viewed.v1';
const LIMIT = 12;

const CARD_FIELDS = [
  'id',
  'uuid',
  'slug',
  'name',
  'brandName',
  'imageUrl',
  'price',
  'salePrice',
  'discountPercent',
  'discountEndsAt',
  'managedSale',
  'partnerId',
  'stock',
  'sold',
  'rating',
  'reviewCount',
  'grade',
  'scale',
  'condition',
  'salesChannel',
] as const;

export function readRecentlyViewed(): ProductSummary[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(value) ? (value as ProductSummary[]) : [];
  } catch {
    return [];
  }
}

export function rememberViewed(product: ProductSummary) {
  try {
    const card = Object.fromEntries(
      CARD_FIELDS.map((field) => [field, (product as unknown as Record<string, unknown>)[field] ?? null]),
    ) as unknown as ProductSummary;
    const next = [card, ...readRecentlyViewed().filter((item) => item.id !== product.id)].slice(0, LIMIT);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Storage unavailable: nothing to remember. */
  }
}
