import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import vi from '../src/messages/vi.json';
import en from '../src/messages/en.json';
import { fixturePreview, installStoreFixture, products } from './fixtures/store-workspace';

async function capture(page: Page, name: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const folder = resolve('../../.artifacts/model-universe/store-workspaces');
  await mkdir(folder, { recursive: true });
  await page.screenshot({ path: resolve(folder, `${name}.png`), fullPage: true });
}

for (const locale of ['vi', 'en'] as const) {
  for (const width of [1440, 390]) {
    test(`${locale} ${width}: bag quantities, unavailable items and review validation`, async ({ page, context }) => {
      test.skip(!fixturePreview, 'Requires the isolated preview and mocked APIs.');
      const m = locale === 'vi' ? vi : en;
      const writes = await installStoreFixture(page, context);
      await page.addInitScript(
        (models) => {
          localStorage.setItem(
            'cart',
            JSON.stringify(
              models.map((product) => ({
                productId: product.id,
                size: '',
                quantity: 1,
                name: product.name,
                imageUrl: product.imageUrl,
                price: product.salePrice,
                brandName: product.brandName,
              })),
            ),
          );
        },
        [products[0], products[2]],
      );
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/${locale}/cart`);
      const review = page.getByRole('button', { name: m.checkout.placeNow, exact: true });
      await expect(review).toBeDisabled();
      await page.getByRole('button', { name: m.checkout.removeUnavailable, exact: true }).click();
      await expect(page.locator('.cart-line-item')).toHaveCount(1);
      const quantity = page.locator('.cart-quantity output');
      await page.getByRole('button', { name: m.checkout.increase, exact: true }).click();
      await expect(quantity).toHaveText('2');
      await page.getByRole('button', { name: m.checkout.decrease, exact: true }).click();
      await expect(quantity).toHaveText('1');
      await expect(review).toBeEnabled();
      await capture(page, `${locale}-${width}-cart`);
      await review.click();
      await expect(page.getByText(m.checkout.validation.cityRequired, { exact: true })).toBeVisible();
      await page.getByLabel(m.checkout.city, { exact: true }).fill('Fixture City');
      await review.click();
      await expect(page.getByRole('heading', { name: m.checkout.confirmTitle })).toBeVisible();
      expect(writes).not.toContain('/api/orders');
      await capture(page, `${locale}-${width}-cart-confirmation`);
    });
    test(`${locale} ${width}: saved models move to bag and unavailable models stay disabled`, async ({
      page,
      context,
    }) => {
      test.skip(!fixturePreview, 'Requires the isolated preview and mocked APIs.');
      const m = locale === 'vi' ? vi : en;
      await installStoreFixture(page, context);
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/${locale}/wishlist`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(m.wishlist.title);
      const cards = page.locator('.wishlist-card');
      await expect(cards).toHaveCount(3);
      await expect(cards.last().getByRole('button', { name: m.wishlist.moveToBag })).toBeDisabled();
      await capture(page, `${locale}-${width}-wishlist`);
      await cards.first().getByRole('button', { name: m.wishlist.moveToBag }).click();
      await expect(cards).toHaveCount(2);
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cart') || '[]')[0].quantity)).toBe(1);
      for (let remaining = 2; remaining > 0; remaining--) {
        await cards.first().locator('.wishlist-remove').click();
        await expect(cards).toHaveCount(remaining - 1);
      }
      await expect(page.getByRole('heading', { name: m.wishlist.emptyTitle })).toBeVisible();
      await capture(page, `${locale}-${width}-wishlist-empty`);
    });
    test(`${locale} ${width}: pagination and compact service introductions`, async ({ page }) => {
      test.setTimeout(90000);
      const m = locale === 'vi' ? vi : en;
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/${locale}/shop`);
      const pagination = page.getByRole('navigation', { name: m.common.pagination });
      await expect(pagination).toBeVisible();
      await expect(pagination.getByRole('button', { name: m.common.previous, exact: true })).toBeDisabled();
      await pagination.getByRole('button', { name: m.common.goToPage.replace('{page}', '2') }).click();
      await expect(page).toHaveURL(/page=2/);
      await expect(pagination.locator('[aria-current="page"]')).toHaveText('2');
      await capture(page, `${locale}-${width}-pagination`);
      await pagination.getByRole('button', { name: m.common.previous, exact: true }).click();
      await expect(page).not.toHaveURL(/page=2/);
      await page.goto(`/${locale}/services`);
      const hub = await page.locator('.store-workspace-heading').boundingBox();
      expect(hub!.height).toBeLessThan(width === 1440 ? 125 : 175);
      await capture(page, `${locale}-${width}-services`);
      await page.goto(`/${locale}/services/sell`);
      const service = await page.locator('.service-experience-header').boundingBox();
      expect(service!.height).toBeLessThan(width === 1440 ? 220 : 240);
      await capture(page, `${locale}-${width}-service-header`);
    });
  }
}
