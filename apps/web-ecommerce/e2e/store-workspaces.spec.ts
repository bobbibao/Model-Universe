import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import vi from '../src/messages/vi.json';
import en from '../src/messages/en.json';

async function capture(page: Page, name: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const folder = resolve('../../.artifacts/model-universe/store-workspaces');
  await mkdir(folder, { recursive: true });
  await page.screenshot({ path: resolve(folder, `${name}.png`), fullPage: true });
}

for (const locale of ['vi', 'en'] as const) {
  for (const width of [1440, 390]) {
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
