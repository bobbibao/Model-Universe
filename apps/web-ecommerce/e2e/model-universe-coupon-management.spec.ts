import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { admin, hasAdmin, writesEnabled } from './helpers';
import en from '../src/messages/en.json';
import vi from '../src/messages/vi.json';

for (const locale of ['vi', 'en']) for (const width of [1440, 390]) {
  test(`${locale} ${width}: coupon CRUD, immutable fixed rewards and recoverable catalog reads`, async ({ page }) => {
    test.skip(!hasAdmin || !writesEnabled || process.env.E2E_COUPON_FIXTURE !== 'dedicated_browser_test' ||
      !process.env.E2E_COUPON_DB_NAME?.endsWith('_test') || !process.env.E2E_COUPON_REWARD_CODE,
      'Requires explicit disposable coupon fixture and a synthetic immutable reward.');
    test.setTimeout(120000);
    const labels = (locale === 'vi' ? vi : en).adminCoupons;
    const code = `UI-${randomUUID().slice(0, 12).toUpperCase()}`;
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    expect((await page.request.post('/api/auth/login', { data: admin })).ok()).toBeTruthy();
    await page.goto(`/${locale}/admin/coupons`);
    await page.getByRole('button', { name: `+ ${labels.create}`, exact: true }).click();
    await page.getByRole('button', { name: labels.save, exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: labels.invalid })).toBeVisible();
    await page.getByLabel(labels.code, { exact: true }).fill(code);
    await page.getByLabel(labels.title, { exact: true }).fill(`Synthetic promotion ${code}`);
    await page.getByLabel(labels.percent, { exact: true }).fill('17');
    await page.getByLabel(labels.usageInput, { exact: true }).fill('3');
    await page.getByLabel(labels.minimumInput, { exact: true }).fill('100000');
    const create = page.waitForResponse(r => r.url().endsWith('/api/admin/coupons') && r.request().method() === 'POST');
    await page.getByRole('button', { name: labels.save, exact: true }).click();
    const created = await create; expect(created.ok(), await created.text()).toBeTruthy();
    const createdBody = await created.json();
    expect(createdBody.userMessages).toContain(labels.created);
    const coupon = createdBody.data;
    const search = page.getByRole('textbox', { name: labels.search, exact: true });
    await search.fill(code);
    const row = page.getByRole('row').filter({ hasText: code });
    await expect(row).toContainText('17%');
    await row.getByRole('button', { name: labels.edit, exact: true }).click();
    await page.getByLabel(labels.percent, { exact: true }).fill('18');
    const update = page.waitForResponse(r => r.url().endsWith(`/api/admin/coupons/${coupon.id}`) && r.request().method() === 'PUT');
    await page.getByRole('button', { name: labels.save, exact: true }).click();
    const updated = await update; expect(updated.ok()).toBeTruthy();
    expect((await updated.json()).userMessages).toContain(labels.updated);
    await expect(row).toContainText('18%');

    // Successful responses use the actual endpoint; only failure and response ordering are injected.
    await page.route('**/api/admin/coupons?**', async route => {
      if (new URL(route.request().url()).searchParams.get('q') === 'TRANSPORT-FAILURE') return route.abort();
      return route.continue();
    });
    await search.fill('TRANSPORT-FAILURE');
    await expect(page.getByRole('alert').filter({ hasText: labels.loadError })).toBeVisible();
    await page.unroute('**/api/admin/coupons?**');
    await search.fill(code); await expect(row).toContainText('18%');
    let release: (() => void) | undefined;
    const delayed = new Promise<void>(resolve => { release = resolve; });
    let fetched: (() => void) | undefined;
    const started = new Promise<void>(resolve => { fetched = resolve; });
    const staleReturned = page.waitForResponse(r => new URL(r.url()).searchParams.get('q') === 'STALE-QUERY');
    await page.route('**/api/admin/coupons?**', async route => {
      if (new URL(route.request().url()).searchParams.get('q') !== 'STALE-QUERY') return route.continue();
      const response = await route.fetch(); fetched!(); await delayed; await route.fulfill({ response });
    });
    await search.fill('STALE-QUERY'); await started;
    await search.fill(process.env.E2E_COUPON_REWARD_CODE!);
    const reward = page.getByRole('row').filter({ hasText: process.env.E2E_COUPON_REWARD_CODE! });
    await expect(reward).toContainText(labels.reward);
    release!(); await (await staleReturned).finished(); await expect(reward).toBeVisible(); await page.unroute('**/api/admin/coupons?**');
    const money = new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-US', { style: 'currency', currency: 'VND' }).format(75000);
    await expect(reward).toContainText(money); await expect(reward).not.toContainText('0%');
    await expect(reward.getByRole('button', { name: labels.edit, exact: true })).toHaveCount(0);
    await expect(reward.getByRole('button', { name: labels.remove, exact: true })).toHaveCount(0);
    const rewardResponse = await page.request.get(`/api/admin/coupons?q=${process.env.E2E_COUPON_REWARD_CODE}`);
    const rewardRecord = (await rewardResponse.json()).payload.data[0];
    const forbiddenEdit = await page.request.put(`/api/admin/coupons/${rewardRecord.id}`, { data: { discountPercent: 1 } });
    const forbiddenDelete = await page.request.delete(`/api/admin/coupons/${rewardRecord.id}`);
    for (const refused of [forbiddenEdit, forbiddenDelete]) {
      expect(refused.status()).toBe(409);
      expect((await refused.json()).errorCode).toBe('COUPON_REWARD_IMMUTABLE');
    }
    const artifacts = path.resolve('../../.artifacts/model-universe/visual'); fs.mkdirSync(artifacts, { recursive: true });
    await page.reload(); await search.fill(process.env.E2E_COUPON_REWARD_CODE!);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(reward).toContainText(labels.reward);
    await page.screenshot({ path: path.join(artifacts, `${locale}-${width}-coupon-management.png`), fullPage: true });
    if (width === 390) {
      await reward.locator('td').nth(2).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(artifacts, `${locale}-${width}-coupon-benefit.png`) });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await search.fill(code); await expect(row).toContainText('18%');
    await row.getByRole('button', { name: labels.remove, exact: true }).click();
    const remove = page.waitForResponse(r => r.url().endsWith(`/api/admin/coupons/${coupon.id}`) && r.request().method() === 'DELETE');
    await page.getByRole('button', { name: labels.remove, exact: true }).last().click();
    const removed = await remove; expect(removed.ok()).toBeTruthy();
    expect((await removed.json()).userMessages).toContain(labels.deleted);
    await expect(row).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
