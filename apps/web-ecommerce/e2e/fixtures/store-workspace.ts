import type { BrowserContext, Page } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { signSessionToken } from '../../src/shared/server/utils/JwtUtils';
import type { ProductDetail } from '../../src/shared/types/product';
import type { WishlistItem } from '../../src/shared/types/cart';

export const fixturePreview =
  process.env.E2E_UI_FIXTURE === '1' && process.env.E2E_BASE_URL === 'http://localhost:6051';
export const products: ProductDetail[] = [900001, 900002, 900003].map((id, index) => ({
  id,
  name: `Synthetic ${index === 1 ? 'MG' : 'RG'} collector model ${index + 1}`,
  brandName: 'Fixture Models',
  gender: 'unisex',
  price: 1000000,
  salePrice: 900000,
  discountPercent: 10,
  discountEndsAt: null,
  stock: index === 2 ? 0 : 5,
  imageUrl: '/images/store/product-placeholder.svg',
  rating: 4.5,
  reviewCount: 2,
  isFeatured: false,
  salesChannel: 'web',
  grade: index === 1 ? 'MG' : 'RG',
  scale: index === 1 ? '1/100' : '1/144',
  series: 'Fixture series',
  modelCode: `UI-${index + 1}`,
  condition: 'new',
  assemblyState: 'unassembled',
  boxCondition: 'New',
  includedAccessories: ['Fixture stand'],
  defects: [],
  sku: `UI-${id}`,
  availableSizes: [],
  sold: 0,
  categoryId: 1,
  images: [],
  ratingDistribution: { '1': 0, '2': 0, '3': 0, '4': 1, '5': 1 },
}));

export async function installStoreFixture(page: Page, context: BrowserContext) {
  loadEnvConfig(process.cwd());
  await context.addCookies([
    {
      name: 'access_token',
      value: await signSessionToken(900001, 'USER'),
      url: 'http://localhost:6051',
      httpOnly: true,
    },
  ]);
  let wishlist: WishlistItem[] = products.map((product, index) => ({
    id: index + 1,
    productId: product.id,
    size: '',
    createdAt: new Date().toISOString(),
    available: true,
    product,
  }));
  const writes: string[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let data: unknown = {};
    if (pathname === '/api/auth/me')
      data = {
        user: {
          id: 900001,
          role: 'USER',
          firstName: 'UI',
          lastName: 'Fixture',
          email: 'ui@example.test',
          phone: '0901234567',
          address: '12 Fixture Street',
        },
      };
    else if (pathname === '/api/wishlist' && request.method() === 'GET') data = wishlist;
    else if (pathname.startsWith('/api/wishlist/') && request.method() === 'DELETE') {
      writes.push(pathname);
      wishlist = wishlist.filter((item) => item.id !== Number(pathname.split('/').pop()));
      data = { success: true };
    } else if (pathname === '/api/cart/quote') {
      const { items } = request.postDataJSON();
      const lines = items.map((item: { productId: number; size: string; quantity: number }) => {
        const product = products.find((product) => product.id === item.productId)!;
        return {
          ...item,
          product,
          availableStock: product.stock,
          lineTotal: product.salePrice * item.quantity,
          status: product.stock === 0 ? 'OUT_OF_STOCK' : item.quantity > product.stock ? 'INSUFFICIENT_STOCK' : 'OK',
        };
      });
      const subtotal = lines.reduce((sum: number, line: { lineTotal: number }) => sum + line.lineTotal, 0);
      data = {
        lines,
        subtotal,
        itemCount: items.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0),
        hasIssues: lines.some((line: { status: string }) => line.status !== 'OK'),
        total: subtotal,
      };
    } else if (/^\/api\/products\/\d+$/.test(pathname))
      data = products.find((product) => product.id === Number(pathname.split('/').pop()));
    else if (pathname === '/api/addresses') data = [];
    else if (pathname === '/api/loyalty') data = { active: false };
    else if (pathname === '/api/orders' && request.method() === 'POST') {
      writes.push(pathname);
      return route.fulfill({ status: 500, json: { userMessages: ['Test-only order failure'], toastType: 'error' } });
    }
    await route.fulfill({ json: { data } });
  });
  return writes;
}
