import { test, expect } from '@playwright/test';

for (const locale of ['vi', 'en']) for (const width of [1440, 390]) {
  test(`${locale} ${width}: real search, empty results, outage recovery and stale response isolation`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 900 });
    const products = (await (await page.request.get('/api/products?per_page=100')).json()).payload.data;
    const product = products.find((row: { partnerId: number | null }) => !row.partnerId);
    expect(product).toBeTruthy();
    await page.goto(`/${locale}/search`);
    const search = page.getByRole('search');
    const input = search.getByRole('searchbox');
    const resultLink = page.locator(`main a.line-clamp-2[href="/${locale}/shop/product/${product.id}"]`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(locale === 'en' ? 'Find your next build.' : 'Tìm mô hình tiếp theo.');
    await input.fill(product.name);
    await search.getByRole('button').click();
    await expect(resultLink).toBeVisible();
    await input.fill('no-such-model-universe-verified-search');
    await search.getByRole('button').click();
    await expect(page.getByRole('status').filter({ hasText: locale === 'en' ? 'No results' : '0 kết quả' })).toBeVisible();
    // Only failure and race injection are mocked; successful catalog reads above use the real API.
    await page.route('**/api/products?*', route => route.abort());
    await input.fill(product.name);
    await search.getByRole('button').click();
    await expect(page.locator('main').getByRole('alert')).toBeVisible();
    await expect(page.locator('main').getByRole('status')).toHaveCount(0);
    await page.unroute('**/api/products?*');
    await page.locator('main').getByRole('alert').getByRole('button').click();
    await expect(resultLink).toBeVisible();
    let release!: () => void;
    const delay = new Promise<void>(resolve => { release = resolve; });
    let observed!: () => void;
    const pending = new Promise<void>(resolve => { observed = resolve; });
    await page.route('**/api/products?*', async route => {
      if (new URL(route.request().url()).searchParams.get('q') === 'delayed-query') {
        observed(); await delay;
        await route.fulfill({ json: { payload: { data: [], pagination: { total: 0, page: 1, per_page: 12, total_pages: 0 } } } });
      } else await route.continue();
    });
    await input.fill('delayed-query'); await search.getByRole('button').click(); await pending;
    await input.fill(product.name); await search.getByRole('button').click();
    await expect(resultLink).toBeVisible();
    const staleResponse = page.waitForResponse(response => new URL(response.url()).searchParams.get('q') === 'delayed-query');
    release();
    await (await staleResponse).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByRole('status')).toContainText(product.name);
    await expect(resultLink).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  });
}
