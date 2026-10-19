import { test, expect } from '@playwright/test';
import { SignJWT } from 'jose';

test.use({ timezoneId: 'Asia/Ho_Chi_Minh' });
for (const locale of ['vi', 'en']) for (const mobile of [false, true]) {
  test(`sale studio and storefront ${locale} ${mobile ? 'mobile' : 'desktop'}`, async ({ page, context }) => {
    test.setTimeout(180_000);
    test.skip(!process.env.E2E_UI_JWT_SECRET, 'Requires the isolated preview test secret');
    const en = locale === 'en';
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    const auth = await new SignJWT({ typ: 'session', role: 'ADMIN' }).setSubject('1').setProtectedHeader({ alg: 'HS256' }).setExpirationTime('10m').sign(new TextEncoder().encode(process.env.E2E_UI_JWT_SECRET));
    await context.addCookies([{ name: 'access_token', value: auth, url: process.env.E2E_BASE_URL! }]);
    const products = Array.from({ length: 28 }, (_, i) => ({ id: i + 1, name: `Gundam ${i + 1} · MG collector kit`, sku: `KIT-${i + 1}`, brandName: 'Bandai', imageUrl: '/images/catalog/gundam-unicorn.webp', price: 1_000_000, costVnd: 100_000, stock: 3, ageDays: 120, maximumSafePercent: 25, currentDiscount: 0, grade: 'MG', condition: 'new', rating: 0, reviewCount: 0, salesChannel: 'web', salePrice: 850_000, discountPercent: 15, discountEndsAt: new Date(Date.now() + 2 * 86400_000).toISOString() }));
    let saved: any;
    let weekly: any;
    let stopped = false;
    const event = { id: 9, title: en ? 'Weekend build festival' : 'Cuối tuần lên kit mới', description: en ? 'Selected models. Real stock. New inspiration.' : 'Dàn kit tuyển chọn, sẵn sàng về góc build của bạn.', kind: 'manual', startsAt: new Date(Date.now() - 3600_000).toISOString(), endsAt: new Date(Date.now() + 2 * 86400_000).toISOString(), maximumPercent: 15, products: products.slice(0, 4), settings: { products: products.slice(0, 4).map((p) => ({ id: p.id, sku: p.sku, percent: 15, price: p.price })) } };
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      if (method === 'POST' && path === '/api/admin/sales') saved = route.request().postDataJSON();
      if (method === 'POST' && path === '/api/admin/sales/weekly-rule') weekly = route.request().postDataJSON();
      if (method === 'POST' && path.endsWith('/cancel')) stopped = true;
      const data = path === '/api/auth/me' ? { user: { id: 1, role: 'ADMIN', email: 'owner@test.example', firstName: 'Owner', lastName: 'Shop' } }
        : path === '/api/admin/sales/candidates' ? products
        : path === '/api/admin/sales' ? { campaigns: [{ ...event, ...(stopped ? { revokedAt: new Date().toISOString() } : {}) }], weeklyRule: weekly || { enabled: false, minAgeDays: 60, productLimit: 12, maxPercent: 25 } }
        : path === '/api/sales' ? { events: [event] } : [];
      await route.fulfill({ json: { statusCode: 200, data, userMessages: [], payload: { data: [], pagination: { total: 0 } } } });
    });
    await page.goto(`/${locale}/admin/sales`);
    await expect(page.getByRole('heading', { name: en ? 'Offers worth coming back for' : 'Ưu đãi khiến khách muốn quay lại' })).toBeVisible();
    const search = page.getByRole('searchbox', { name: en ? 'Search products' : 'Tìm sản phẩm' });
    await search.fill('KIT-28');
    await expect(page.locator('.sa-product')).toHaveCount(1);
    expect(await search.evaluate((e) => getComputedStyle(e).borderWidth)).toBe('0px');
    await page.getByRole('button', { name: en ? 'Select all eligible' : 'Chọn tất cả phù hợp', exact: true }).click();
    await search.fill('');
    await page.getByRole('button', { name: en ? 'Select all eligible' : 'Chọn tất cả phù hợp', exact: true }).click();
    await expect(page.locator('.sa-product input:checked')).toHaveCount(28);
    await page.getByLabel(en ? 'Event name' : 'Tên sự kiện', { exact: true }).fill(event.title);
    await page.getByRole('button', { name: '15%', exact: true }).click();
    const starts = page.getByLabel(en ? 'Starts at' : 'Bắt đầu lúc', { exact: true });
    await starts.locator('..').getByRole('button').click();
    await expect(page.locator('.dt-popover:popover-open')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.screenshot({ path: `e2e/.results/sale-admin-${locale}-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true });
    await page.getByRole('button', { name: en ? 'Schedule sale event' : 'Lên lịch sự kiện sale', exact: true }).click();
    await expect.poll(() => saved?.productIds?.length).toBe(28);
    expect(saved.percent).toBe(15);
    await page.getByLabel(en ? 'Enable weekly selection' : 'Bật chọn sale hàng tuần', { exact: true }).check();
    await page.getByRole('button', { name: en ? 'Save weekly rule' : 'Lưu lịch hàng tuần' }).click();
    await expect.poll(() => weekly?.enabled).toBe(true);
    await page.getByRole('button', { name: en ? 'Stop event' : 'Dừng sự kiện', exact: true }).click();
    await page.getByRole('button', { name: en ? 'Confirm stop' : 'Xác nhận dừng', exact: true }).click();
    await expect(page.getByText(en ? 'Stopped' : 'Đã dừng', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto(`/${locale}/uu-dai?event=9`);
    await expect(page.getByRole('heading', { name: event.title, exact: true })).toBeVisible();
    await expect(page.locator('.sale-products .mu-product')).toHaveCount(4);
    await expect(page.locator('.sale-photo-badge').first()).toHaveText('−15%');
    await expect(page.locator('.sale-time')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `e2e/.results/sale-store-${locale}-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true });
  });
}
