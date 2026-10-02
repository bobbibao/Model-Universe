// How each seeded product behaves in the synthetic history. Derived from the SKU with a fixed hash (no random draw),
// so every seeder agrees without sharing state, and the development shop always shows the agent's signals:
// - `slow`: stocked long ago, no sale in the last months: the dead-stock candidates (SOP-001);
// - `new`: added in the last two weeks (new-arrival protection);
// - `popular` / `normal`: restocked regularly; the high-return signal products are picked among `normal` ones.

export type ProductTier = 'popular' | 'normal' | 'slow' | 'new';

const SLOW_PERCENT = 15;
const POPULAR_PERCENT = 20;
const NEW_PERCENT = 4;

// 32-bit FNV-1a.
const hash = (text: string): number => {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
};

export const productTier = (sku: string): ProductTier => {
  const bucket = hash(sku) % 100;
  if (bucket < SLOW_PERCENT) return 'slow';
  if (bucket < SLOW_PERCENT + NEW_PERCENT) return 'new';
  if (bucket < SLOW_PERCENT + NEW_PERCENT + POPULAR_PERCENT) return 'popular';
  return 'normal';
};

// Relative chance of a product being in an order: slow products stop selling after `SLOW_LAST_SALE_DAYS`.
export const SLOW_LAST_SALE_DAYS = 120;
export const tierWeight = (tier: ProductTier, ageDays: number): number => {
  switch (tier) {
    case 'popular':
      return 5;
    case 'normal':
      return 1;
    case 'new':
      return 3;
    case 'slow':
      return ageDays > SLOW_LAST_SALE_DAYS ? 0.3 : 0;
  }
};
