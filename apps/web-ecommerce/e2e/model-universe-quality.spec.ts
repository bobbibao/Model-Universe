import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { admin, customer, hasAdmin, hasCustomer } from './helpers';

for (const locale of ['vi', 'en']) for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`${locale} ${viewport.width}: production public, account and operations route regression`, async ({ page }) => {
    test.skip(!hasAdmin || !hasCustomer, 'Requires the disposable verification accounts.');
    test.setTimeout(240000); await page.setViewportSize(viewport);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const artifacts = path.resolve('../../.artifacts/model-universe/visual'); fs.mkdirSync(artifacts, { recursive: true });
    const visit = async (route: string) => {
      const response = await page.goto(`/${locale}${route}`); expect(response?.status(), route).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('main').getByRole('heading').first(), route).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBeTruthy();
      expect(errors, route).toEqual([]);
    };
    for (const route of ['', '/shop', '/search', '/kit-finder', '/compare', '/services', '/about']) await visit(route);
    const products = (await (await page.request.get('/api/products?per_page=100')).json()).payload.data;
    const product = products.find((row: { partnerId: number | null }) => !row.partnerId);
    expect(product).toBeTruthy();
    const html = await (await page.request.get(`/${locale}/shop/product/${product.id}`)).text();
    expect(html).toContain(product.name); expect(html).toContain('<h1'); expect(html).toContain(`${product.name} | Model Universe`);
    await visit(`/shop/product/${product.id}`);
    await page.screenshot({ path: path.join(artifacts, `${locale}-${viewport.width}-production-product.png`), fullPage: true });
    expect((await page.request.post('/api/auth/login', { data: customer })).ok()).toBeTruthy();
    for (const route of ['/user-profile', '/order-history', '/account/addresses', '/account/notifications', '/services/loyalty', '/services/sell', '/services/pawn', '/reservations', '/cart']) await visit(route);
    await page.goto(`/${locale}/admin/orders`); await expect(page).toHaveURL(new RegExp(`/${locale}$`));
    await page.context().clearCookies(); expect((await page.request.post('/api/auth/login', { data: admin })).ok()).toBeTruthy();
    for (const route of ['/admin/dashboard', '/admin/orders', '/admin/products', '/admin/stock', '/admin/returns', '/admin/reservations', '/admin/loyalty', '/admin/buyback', '/admin/pawn', '/admin/partners', '/admin/partner-listings', '/admin/commerce/policies']) await visit(route);
    await page.goto(`/${locale}/admin/dashboard`);
    await expect(page.locator('main').getByRole('heading').first()).toHaveText(locale === 'en' ? 'Operations overview' : 'Tổng quan vận hành');
    await expect(page.locator('.apexcharts-canvas').first()).toBeVisible();
    await page.screenshot({ path: path.join(artifacts, `${locale}-${viewport.width}-production-operations.png`), fullPage: true });
    await page.goto(`/${locale}/admin/orders`);
    await expect(page.getByPlaceholder(locale === 'en' ? 'Order, recipient, phone or email…' : 'Mã đơn, người nhận, điện thoại hoặc email…')).toBeVisible();
    const record = page.locator('main').getByRole('button', { name: /^(Open record|Mở bản ghi) / }).first();
    const recordId = (await record.getAttribute('aria-label'))!.split(' ').pop();
    await record.focus(); await record.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/${locale}/admin/orders/${recordId}$`));
    const profiles = await (await page.request.get('/api/admin/partners')).json();
    let sellerId: number | undefined, sellerName = '';
    for (const row of profiles.rows) {
      const response = await page.request.get(`/api/sellers/${row.id}`);
      if (response.ok()) {
        const store = await response.json(); expect(Object.keys(store).sort()).toEqual(['bankVerified', 'displayName', 'id', 'identityVerified', 'products']);
        sellerId = row.id; sellerName = store.displayName; break;
      }
    }
    expect(sellerId).toBeTruthy(); await page.context().clearCookies(); await visit(`/sellers/${sellerId}`);
    await expect(page.locator('main').getByRole('heading', { level: 1 })).toHaveText(sellerName);
    await expect(page.locator('main').getByRole('status')).toHaveCount(0);
    await page.screenshot({ path: path.join(artifacts, `${locale}-${viewport.width}-public-seller.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}
