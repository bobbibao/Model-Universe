import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import en from '../src/messages/en.json';
import vi from '../src/messages/vi.json';
import { admin, customer, hasAdmin, hasCustomer } from './helpers';

const artifacts = resolve(__dirname, '../../../.artifacts/model-universe/workspace-controls');
for (const locale of ['vi', 'en'])
  for (const width of [320, 390, 768, 1440]) {
    test(`${locale} ${width}: saved models are discoverable and native pickers stay on one row`, async ({ page }) => {
      test.skip(!hasCustomer, 'Requires retained synthetic customer');
      await page.setViewportSize({ width, height: 950 });
      expect((await page.request.post('/api/auth/login', { data: customer })).ok()).toBe(true);
      await page.goto(`/${locale}/shop`);
      const messages = locale === 'vi' ? vi : en;
      const nav = page.locator(width <= 640 ? '.mu-mobile-nav:visible' : '.mu-header:visible');
      await nav.getByRole('link', { name: messages.nav.saved, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/wishlist`));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.goto(`/${locale}/user-profile`);
      await expect(page.locator('.account-sidebar').getByRole('link', { name: messages.nav.saved })).toBeVisible();
      await page.goto(`/${locale}/services/sell`);
      await page.getByRole('button', { name: messages.buyback.newRequest, exact: true }).click();
      const picker = page.locator('select:visible').first();
      await expect(picker).toBeVisible();
      expect(await picker.evaluate((el) => getComputedStyle(el).display)).toBe('flex');
      expect(await picker.evaluate((el) => getComputedStyle(el, '::picker-icon').flexShrink)).toBe('0');
      expect(await picker.evaluate((el) => getComputedStyle(el, '::picker-icon').position)).toBe('absolute');
      const before = (await picker.boundingBox())!.height;
      // Reproduce a narrow field with a long selected label without changing server data.
      await picker.evaluate((el: HTMLSelectElement) => {
        el.selectedOptions[0].textContent = 'A very long assembly condition label that must never wrap its picker icon';
      });
      expect((await picker.boundingBox())!.height).toBe(before);
      await picker.click();
      await expect(picker.getByRole('option').first()).toBeVisible();
      await mkdir(artifacts, { recursive: true });
      await page.screenshot({
        animations: 'disabled',
        path: resolve(artifacts, `${locale}-${width}-service-picker.png`),
      });
      await page.keyboard.press('Escape');
      await expect(picker).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect(await page.evaluate(() => getComputedStyle(document.body).scrollbarWidth)).toBe('thin');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
    });
  }
for (const locale of ['vi', 'en'])
  for (const width of [390, 1440]) {
    test(`${locale} ${width}: marketing schedule preview, clear and dark picker interactions`, async ({ page }) => {
      test.skip(!hasAdmin, 'Requires retained synthetic administrator');
      await page.setViewportSize({ width, height: 950 });
      expect((await page.request.post('/api/auth/login', { data: admin })).ok()).toBe(true);
      await page.goto(`/${locale}/admin/marketing`);
      const schedule = page.locator('input[type="datetime-local"]:visible');
      await expect(schedule).toBeEnabled();
      await schedule.fill('2027-01-15T10:30');
      await expect(page.locator('.marketing-schedule-preview')).toContainText('2027');
      await page
        .locator('.marketing-schedule')
        .getByRole('button', { name: locale === 'en' ? 'Clear schedule' : 'Bỏ lịch', exact: true })
        .click();
      await expect(schedule).toHaveValue('');
      await page.evaluate(() => document.documentElement.classList.add('dark'));
      const picker = page.locator('select:visible').first();
      expect(await picker.evaluate((el) => getComputedStyle(el).display)).toBe('flex');
      await picker.click();
      await mkdir(artifacts, { recursive: true });
      await page.screenshot({
        animations: 'disabled',
        path: resolve(artifacts, `${locale}-${width}-marketing-picker.png`),
      });
      await page.keyboard.press('Escape');
      await schedule.scrollIntoViewIfNeeded();
      await page.screenshot({ animations: 'disabled', path: resolve(artifacts, `${locale}-${width}-schedule.png`) });
      expect(await schedule.evaluate((el) => getComputedStyle(el).colorScheme)).toBe('dark');
    });
  }
