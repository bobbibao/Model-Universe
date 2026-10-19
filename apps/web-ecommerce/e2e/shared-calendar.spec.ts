import { test, expect } from '@playwright/test';
import { SignJWT } from 'jose';
import en from '../src/messages/en.json';

test.use({ timezoneId: 'Asia/Ho_Chi_Minh' });
test('shared calendar supports historical dates, native form values and voucher modals', async ({ page, context }) => {
  test.setTimeout(120000);
  test.skip(!process.env.E2E_UI_JWT_SECRET, 'Requires an isolated preview with the test-only JWT secret');
  const token = await new SignJWT({ typ: 'session', role: 'ADMIN' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('1')
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(process.env.E2E_UI_JWT_SECRET!));
  await context.addCookies([
    { name: 'access_token', value: token, url: process.env.E2E_BASE_URL || 'http://localhost:6055' },
  ]);
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data =
      path === '/api/auth/me'
        ? { id: 1, role: 'ADMIN', name: 'Owner', email: 'owner@example.test' }
        : path === '/api/admin/products/1'
          ? {
              id: 1,
              name: 'Test model',
              sku: 'TEST-1',
              brandName: 'Bandai',
              availableSizes: [],
              images: [],
              imageUrl: '/images/catalog/gundam-unicorn.webp',
              categoryId: 1,
              gender: 'unisex',
              price: 100000,
              importPrice: 50000,
              stock: 1,
              isFeatured: false,
              isArchived: false,
              inventoryStatus: 'available',
            }
          : [];
    await route.fulfill({
      json: {
        statusCode: 200,
        data,
        payload: { data: [], pagination: { total: 0, page: 1, totalPages: 1 } },
        userMessages: [],
      },
    });
  });
  await page.goto('/en/admin/products/1');
  const input = page.getByLabel(en.adminProducts.receivedDate, { exact: true });
  await input.locator('..').getByRole('button', { name: en.calendar.open }).click();
  const picker = page.locator('.dt-popover:popover-open');
  await picker.getByRole('spinbutton', { name: en.calendar.year, exact: true }).fill('2024');
  await picker.getByRole('combobox', { name: en.calendar.month, exact: true }).selectOption('1');
  await picker.getByRole('button', { name: 'Thursday, 29 February 2024', exact: true }).click();
  await picker.getByRole('button', { name: en.calendar.confirm, exact: true }).click();
  await expect(input).toHaveValue('2024-02-29');
  await input.fill('2025-02-29');
  expect(await input.evaluate((element) => (element as HTMLInputElement).validity.valid)).toBe(false);
  await input.fill('2024-02-29');
  await input.locator('..').getByRole('button', { name: en.calendar.open }).click();
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await page.goto('/en/admin/coupons');
  await page.getByRole('button', { name: new RegExp(en.adminCoupons.create) }).click();
  const start = page.getByLabel(en.adminCoupons.start, { exact: true });
  await start.locator('..').getByRole('button', { name: en.calendar.open }).click();
  await expect(page.locator('.dt-popover:popover-open .dt-calendar')).toBeVisible();
  const box = await page.locator('.dt-popover:popover-open').boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.keyboard.press('Escape');
  await start.fill('2026-10-20');
  expect(await start.evaluate((element) => new FormData((element as HTMLInputElement).form!).get('startDate'))).toBe(
    '2026-10-20',
  );
  expect(await page.locator('input[type="date"], input[type="datetime-local"]').count()).toBe(0);
});
