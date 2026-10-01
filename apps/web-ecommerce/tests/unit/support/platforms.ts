import type { NewAd } from '../../../src/core/server/services/marketing/platforms';

// An ad as the web asks a platform to create it (MarketingActions.newAdOf builds it from the approved body).
export const sampleAd = (overrides: Partial<NewAd> = {}): NewAd => ({
  ref: 'ad-meta-1',
  name: 'ag-ads00001-opt1 ad-meta-1',
  objective: 'traffic',
  dailyBudgetVnd: 200000,
  startsAt: new Date(Date.now() + 3600_000),
  endsAt: new Date(Date.now() + 5 * 24 * 3600_000),
  landingUrl: 'https://shop.example.vn/products?utm_source=facebook&utm_medium=cpc&utm_campaign=ag-ads00001-opt1',
  creative: {
    headline: 'Giày mới mùa thu',
    primary_text: 'Êm chân cả ngày.',
    headlines: ['Giày mới mùa thu', 'Êm chân cả ngày', 'Giao hàng nhanh'],
    descriptions: ['Nhiều mẫu mới cho mùa thu.', 'Đổi trả trong 7 ngày.'],
    keywords: ['giày nam', 'giày sneaker'],
    ad_text: 'Giày mới mùa thu',
    imageUrl: 'https://shop.example.vn/uploads/shoe.jpg',
    videoUrl: 'https://shop.example.vn/uploads/shoe.mp4',
  },
  ...overrides,
});
