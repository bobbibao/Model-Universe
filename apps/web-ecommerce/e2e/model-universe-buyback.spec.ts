import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { admin, customer, hasAdmin, hasCustomer, writesEnabled } from './helpers';
import en from '../src/messages/en.json';
import vi from '../src/messages/vi.json';

const artifacts = path.resolve('../../.artifacts/model-universe/visual');
for (const locale of ['vi', 'en']) {
  for (const device of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    test(`${locale} ${device.name}: private model submission and preliminary appraisal`, async ({ page, browser }) => {
      test.skip(!hasAdmin || !hasCustomer || !writesEnabled, 'Requires disposable accounts and authorized verification writes.');
      test.setTimeout(180000);
      const messages = locale === 'en' ? en : vi;
      await page.setViewportSize(device);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      expect((await page.request.post('/api/auth/login', { data: customer })).ok()).toBeTruthy();
      await page.goto(`/${locale}/services/sell`);
      await expect(page.getByRole('heading', { name: messages.buyback.title, exact: true })).toBeVisible();
      await page.getByRole('button', { name: messages.buyback.newRequest, exact: true }).click();
      const modelName = `Browser inspection fixture ${locale} ${device.name}`;
      const fields = { name: modelName, modelCode: 'FIXTURE-SF-01', version: 'Inspected custom Strike Freedom', boxCondition: 'No original box', accessories: 'Display stand', defects: 'Paint wear on shield', repairHistory: 'Custom painted; no repairs reported' };
      for (const [key, value] of Object.entries(fields)) await page.getByLabel(messages.buyback.asset[key as keyof typeof messages.buyback.asset], { exact: true }).fill(value);
      await page.getByRole('combobox', { name: messages.buyback.asset.assemblyState, exact: true }).selectOption('painted');
      const photos = ['strike-freedom-custom.webp', 'strike-freedom-custom-side.webp', 'strike-freedom-custom-detail.webp'].map(name => path.resolve('public/images/catalog', name));
      await page.getByLabel(messages.buyback.photos, { exact: true }).setInputFiles(photos);
      await expect(page.getByRole('button', { name: messages.common.submit, exact: true })).toBeEnabled();
      await expect(page.getByText(path.basename(photos[2]), { exact: true })).toBeVisible();
      fs.mkdirSync(artifacts, { recursive: true });
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: path.join(artifacts, `${locale}-${device.name}-sell-form.png`), fullPage: true });
      const create = page.waitForResponse(response => response.url().endsWith('/api/buyback') && response.request().method() === 'POST');
      await page.getByRole('button', { name: messages.common.submit, exact: true }).click();
      const created = await create;
      expect(created.ok()).toBeTruthy();
      const row = (await created.json()).data;
      await expect(page.getByRole('heading', { name: modelName, exact: true }).last()).toBeVisible();
      const staffContext = await browser.newContext({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:6050', viewport: device });
      const staff = await staffContext.newPage();
      staff.on('pageerror', error => errors.push(error.message));
      expect((await staff.request.post('/api/auth/login', { data: admin })).ok()).toBeTruthy();
      await staff.goto(`/${locale}/admin/buyback`);
      await staff.getByRole('button').filter({ hasText: `#${row.id} ·` }).click();
      await staff.getByLabel(messages.buyback.amount, { exact: true }).fill('900000');
      await staff.getByLabel(messages.buyback.details, { exact: true }).fill('Synthetic photo-based estimate; actual inspection still required');
      await staff.getByRole('button', { name: messages.buyback.preliminaryOffer, exact: true }).click();
      await expect(staff.getByText(messages.buyback.preliminaryNote, { exact: true })).toBeVisible();
      await staff.evaluate(() => scrollTo(0, 0));
      await staff.screenshot({ path: path.join(artifacts, `${locale}-${device.name}-staff-buyback.png`), fullPage: true });
      await page.reload();
      await page.getByRole('button').filter({ hasText: `#${row.id} ·` }).click();
      await expect(page.getByText(messages.buyback.preliminaryNote, { exact: true })).toBeVisible();
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: path.join(artifacts, `${locale}-${device.name}-sell-appraisal.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      expect(await staff.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      expect(errors).toEqual([]);
      await staffContext.close();
    });
  }
}
