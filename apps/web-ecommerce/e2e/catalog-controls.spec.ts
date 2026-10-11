import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import en from '../src/messages/en.json';
import vi from '../src/messages/vi.json';
import { admin, hasAdmin } from './helpers';
const folder = resolve(__dirname, '../../../.artifacts/model-universe/catalog-controls');
async function capture(page: Page, name: string) {
  await mkdir(folder, { recursive: true });
  await page.screenshot({ path: resolve(folder, `${name}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
async function revealFilters(page: Page) {
  const filters = page.locator('.catalog-mobile-filters');
  if (page.viewportSize()!.width >= 1024) {
    await expect(filters).toHaveAttribute('open', '');
    return;
  }
  if (!(await filters.evaluate((element) => (element as HTMLDetailsElement).open)))
    await filters.locator(':scope > summary').click();
}
async function revealRefinements(page: Page) {
  await revealFilters(page);
  const more = page.locator('.catalog-filter-more');
  if (!(await more.evaluate((element) => (element as HTMLDetailsElement).open))) await more.locator('summary').click();
}
for (const locale of ['vi', 'en'])
  for (const width of [1440, 390]) {
    test(`${locale} ${width}: catalog picker, dual price handles, URL bounds and reset`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: 1000 });
      const messages = locale === 'vi' ? vi : en;
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`/${locale}/search?q=Gundam`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/shop\\?q=Gundam`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages.catalog.title);
      const main = await page.locator('.catalog-main').boundingBox();
      const sidebar = await page.locator('.catalog-sidebar').boundingBox();
      if (width >= 1024) expect(sidebar!.x).toBeGreaterThan(main!.x + main!.width);
      else await expect(page.locator('.catalog-mobile-filters')).not.toHaveAttribute('open', '');
      await page.getByRole('searchbox').fill('');
      await revealFilters(page);
      const form = page.locator('.catalog-filters');
      const apply = form.getByRole('button', { name: messages.catalog.apply, exact: true });
      await apply.click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/shop$`));
      const sort = page.getByLabel(messages.catalog.sort, { exact: true });
      await sort.click();
      await capture(page, `${locale}-${width}-sort-picker`);
      await sort.getByRole('option', { name: messages.catalog.price_asc, exact: true }).click();
      await expect(sort).toHaveValue('price_asc');
      await sort.focus();
      await sort.press('ArrowDown');
      await sort.press('Escape');
      await expect(sort).toBeFocused();
      await form.getByRole('radio', { name: 'MG', exact: true }).check();
      await apply.click();
      await expect(page).toHaveURL(/grade=MG/);
      await expect(page).toHaveURL(/sort=price_asc/);
      await form.getByRole('radio', { name: messages.catalog.allGrades, exact: true }).check();
      const more = page.locator('.catalog-filter-more:visible');
      await revealRefinements(page);
      const condition = page.getByLabel(messages.catalog.condition, { exact: true });
      await condition.click();
      await capture(page, `${locale}-${width}-condition-picker`);
      await condition.getByRole('option', { name: messages.catalog.preowned, exact: true }).click();
      await expect(condition).toHaveValue('preowned');
      await condition.selectOption('');
      await expect(more).toHaveAttribute('open', '');
      const low = page.locator('#filter-min-price:visible');
      const high = page.locator('#filter-price:visible');
      await expect(high).toBeEnabled();
      const limit = Number(await high.getAttribute('max'));
      expect(limit).toBeGreaterThan(0);
      await low.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
      const track = await page.locator('.catalog-range-track:visible').boundingBox();
      await page.mouse.move(track!.x + 12, track!.y + track!.height / 2);
      await page.mouse.down();
      await page.mouse.move(track!.x + track!.width * 0.2, track!.y + track!.height / 2, { steps: 8 });
      await page.mouse.up();
      expect(Number(await low.inputValue())).toBeGreaterThan(0);
      await page.mouse.move(track!.x + track!.width - 12, track!.y + track!.height / 2);
      await page.mouse.down();
      await page.mouse.move(track!.x + track!.width * 0.7, track!.y + track!.height / 2, { steps: 8 });
      await page.mouse.up();
      expect(Number(await high.inputValue())).toBeLessThan(limit);
      expect(Number(await high.inputValue())).toBeGreaterThanOrEqual(Number(await low.inputValue()));
      await low.focus();
      await low.press('Home');
      await expect(low).toHaveValue('0');
      const min = page.locator('#filter-min-price-input:visible');
      const max = page.locator('#filter-max-price-input:visible');
      await max.fill('800000');
      await min.fill('200000');
      await max.fill('');
      await max.pressSequentially('800000');
      await expect(max).toHaveValue('800000');
      await capture(page, `${locale}-${width}-budget`);
      const responsePromise = page.waitForResponse((r) => {
        const url = new URL(r.url());
        return (
          url.pathname === '/api/products' &&
          url.searchParams.get('minPrice') === '200000' &&
          url.searchParams.get('maxPrice') === '800000'
        );
      });
      await apply.click();
      const response = await responsePromise;
      expect(response.ok()).toBe(true);
      const payload = await response.json();
      for (const product of payload.payload.data) {
        expect(Number(product.price)).toBeGreaterThanOrEqual(200000);
        expect(Number(product.price)).toBeLessThanOrEqual(800000);
      }
      await expect(page).toHaveURL(/minPrice=200000/);
      await expect(page).toHaveURL(/maxPrice=800000/);
      await form.getByRole('button', { name: messages.catalog.reset, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/shop$`));
      await page.goBack();
      await expect(page.locator('#filter-min-price-input:visible')).toHaveValue('200000');
      await expect(page.locator('#filter-max-price-input:visible')).toHaveValue('800000');
      await page.goto(`/${locale}/shop?maxPrice=0`);
      await revealRefinements(page);
      await expect(page.locator('#filter-max-price-input:visible')).toHaveValue('0');
      await expect(page.locator('.catalog-results:visible')).toHaveText(
        messages.catalog.results.replace('{count}', '0'),
      );
      await capture(page, `${locale}-${width}-zero-budget`);
      await page.goto(`/${locale}/kit-finder?grade=HG&maxPrice=800000`);
      await revealFilters(page);
      await expect(page).toHaveURL(new RegExp(`/${locale}/shop\\?grade=HG&maxPrice=800000`));
      await expect(form.getByRole('radio', { name: 'HG', exact: true })).toBeChecked();
      if (width === 1440) {
        await expect(
          page.locator('.mu-links').getByRole('link', { name: messages.nav.finder, exact: true }),
        ).toHaveCount(0);
      }
      const cart = page.locator('.mu-header:visible').getByRole('button', { name: messages.nav.cart, exact: true });
      await cart.click();
      await capture(page, `${locale}-${width}-bag-popover`);
      await expect(page.locator('.store-cart-popover:visible')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(cart).toBeFocused();
      await expect(page.locator('.store-cart-popover:visible')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
test('admin native picker retains keyboard and real list filtering', async ({ page }) => {
  test.skip(!hasAdmin, 'Requires retained synthetic administrator');
  expect((await page.request.post('/api/auth/login', { data: admin })).ok()).toBe(true);
  await page.goto('/en/admin/products');
  const select = page.locator('main select:visible').first();
  await select.click();
  await capture(page, 'admin-picker');
  await page.keyboard.press('Escape');
  await expect(select).toBeFocused();
  expect(await select.evaluate((element) => getComputedStyle(element).appearance)).toBe('base-select');
  const user = page.locator('.admin-user-trigger:visible');
  await user.click();
  await capture(page, 'admin-user-menu');
  await page.keyboard.press('Escape');
  await expect(user).toBeFocused();
  await expect(page.locator('.admin-user-menu:visible')).toHaveCount(0);
});

test('late filter metadata preserves a customer search draft', async ({ page }) => {
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/products/filters', async (route) => {
    await delayed;
    await route.continue();
  });
  await page.goto('/en/shop');
  const input = page.getByRole('searchbox');
  await input.fill('Unicorn');
  await page.getByRole('radio', { name: 'HG', exact: true }).check();
  await page.locator('.catalog-filters').getByRole('button', { name: en.catalog.apply, exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('Unicorn');
  expect(new URL(page.url()).searchParams.has('maxPrice')).toBe(false);
  const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/products/filters');
  release();
  await (await response).finished();
  await expect(input).toHaveValue('Unicorn');
  await expect(page.getByRole('radio', { name: 'HG', exact: true })).toBeChecked();
  await revealRefinements(page);
  await expect(page.locator('#filter-price:visible')).toBeEnabled();
  await expect(input).toHaveValue('Unicorn');
});

test('narrow phone and tablet filters stay within the viewport', async ({ page }) => {
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/en/shop');
    await capture(page, `en-${width}-compact`);
    await revealRefinements(page);
    await page.locator('#filter-price:visible').scrollIntoViewIfNeeded();
    await capture(page, `en-${width}-advanced`);
    const cart = page.locator('.mu-header:visible').getByRole('button', { name: en.nav.cart, exact: true });
    await cart.click();
    const box = await page.locator('.store-cart-popover:visible').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    await capture(page, `en-${width}-bag-popover`);
    await page.keyboard.press('Escape');
  }
});
