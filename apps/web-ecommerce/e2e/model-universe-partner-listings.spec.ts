import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { admin, hasAdmin, writesEnabled } from './helpers';
import en from '../src/messages/en.json';
import vi from '../src/messages/vi.json';

const artifacts = path.resolve('../../.artifacts/model-universe/visual');
let index = Number(process.env.E2E_PARTNER_LISTING_CUSTOMER_OFFSET || 0);
for (const locale of ['vi', 'en'] as const)
  for (const device of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const customerNumber = ++index;
    test(`${locale} ${device.name}: seller photos, condition revision and separate content approval`, async ({
      page,
      browser,
    }) => {
      test.skip(
        !hasAdmin || !writesEnabled || process.env.E2E_PARTNER_LISTINGS_FIXTURE !== 'dedicated_partner_browser_test',
        'Requires the isolated database with verified synthetic seller accounts.',
      );
      test.setTimeout(180000);
      const m = locale === 'en' ? en : vi;
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize(device);
      expect(
        (
          await page.request.post('/api/auth/login', {
            data: { email: `customer${customerNumber}@example.com`, password: 'Customer@123' },
          })
        ).ok(),
      ).toBeTruthy();
      const profile = await (await page.request.get('/api/partners/application')).json();
      expect(profile.status).toBe('verified');
      await page.goto(`/${locale}/partner/inventory`);
      await page.getByRole('button', { name: m.partnerListings.create, exact: true }).click();
      let form = page.getByRole('form', { name: m.partnerListings.listingForm });
      const fields = {
        name: `Synthetic RG seller fixture ${locale} ${device.name}`,
        brandName: 'Synthetic manufacturer',
        modelCode: 'SYNTHETIC-144',
        scale: '1/144',
        series: 'Synthetic test universe',
        boxCondition: 'Synthetic worn box',
      };
      for (const [key, value] of Object.entries(fields))
        await form.getByLabel(m.partnerListings.fields[key as keyof typeof fields], { exact: true }).fill(value);
      const categories = await (await page.request.get('/api/categories')).json();
      const category = categories.find((row: { slug: string }) => row.slug === 'gunpla');
      expect(category).toBeTruthy();
      await form.getByRole('combobox', { name: m.partnerListings.fields.categoryId, exact: true }).selectOption(String(category.id));
      await form.getByRole('combobox', { name: m.partnerListings.fields.grade, exact: true }).selectOption('RG');
      await form.getByRole('combobox', { name: m.partnerListings.fields.condition, exact: true }).selectOption('preowned');
      await form.getByRole('combobox', { name: m.partnerListings.fields.assemblyState, exact: true }).selectOption('assembled');
      await form.getByLabel(m.partnerListings.fields.price, { exact: true }).fill('1350000');
      await form.getByLabel(m.partnerListings.fields.stock, { exact: true }).fill('1');
      await form.getByLabel(m.partnerListings.fields.dispatchDays, { exact: true }).fill('2');
      await form
        .getByRole('textbox', { name: m.partnerListings.fields.description, exact: true })
        .fill('Synthetic listing for disposable browser tests. All merchandise views below are labeled fixtures.');
      await form
        .getByRole('textbox', { name: m.partnerListings.fields.includedAccessories, exact: true })
        .fill('Synthetic test accessory');
      await form
        .getByRole('textbox', { name: m.partnerListings.fields.defects, exact: true })
        .fill('Synthetic missing antenna disclosure');
      const photoPage = await browser.newPage({ viewport: { width: 600, height: 600 } });
      fs.mkdirSync(artifacts, { recursive: true });
      const photos: string[] = [];
      for (let angle = 1; angle <= 3; angle++) {
        await photoPage.setContent(
          `<main style="font-family:Arial;padding:50px;background:${['#cffafe', '#fef3c7', '#e0e7ff'][angle - 1]};height:480px"><h1>SYNTHETIC MERCHANDISE VIEW ${angle}</h1><p>This is an explicit disposable test fixture, not a product photograph.</p><div style="margin:50px;width:${angle * 65}px;height:${angle * 50}px;background:#142033"></div></main>`,
        );
        const file = path.join(artifacts, `${locale}-${device.name}-listing-fixture-${angle}.png`);
        await photoPage.screenshot({ path: file });
        photos.push(file);
      }
      await photoPage.close();
      await form.getByLabel(m.partnerListings.photoConsent, { exact: true }).check();
      const upload = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/partners/listings/photos') && response.request().method() === 'POST',
      );
      await form.getByLabel(m.partnerListings.photos, { exact: true }).setInputFiles(photos);
      const uploaded = await upload;
      expect(uploaded.ok()).toBeTruthy();
      const media = (await uploaded.json()).data;
      expect(media).toHaveLength(3);
      expect(new Set(media.map((file: { sha256: string }) => file.sha256)).size).toBe(3);
      await form.getByLabel(m.partnerListings.conditionConsent, { exact: true }).check();
      const create = page.waitForResponse(
        (response) => response.url().endsWith('/api/partners/listings') && response.request().method() === 'POST',
      );
      await form.getByRole('button', { name: m.partnerListings.save, exact: true }).click();
      const created = await create;
      expect(created.ok()).toBeTruthy();
      let row = (await created.json()).data;
      expect(row.listingStatus).toBe('draft');
      expect(row.stock).toBe(1);
      expect(row.photos).toHaveLength(3);
      await page.getByRole('button', { name: m.partnerListings.submitReview, exact: true }).click();
      await expect(page.getByText(m.partnerListings.statuses.review, { exact: true }).first()).toBeVisible();
      const context = await browser.newContext({ viewport: device });
      const staff = await context.newPage();
      staff.on('pageerror', (error) => errors.push(error.message));
      expect((await context.request.post('/api/auth/login', { data: admin })).ok()).toBeTruthy();
      await staff.goto(`/${locale}/admin/partner-listings`);
      await staff
        .getByRole('button')
        .filter({ hasText: `#${row.id} ·` })
        .click();
      let review = staff.getByRole('form', { name: m.partnerListings.reviewForm });
      await review.getByRole('combobox', { name: m.partnerListings.action, exact: true }).selectOption('reject');
      await review
        .getByRole('textbox', { name: m.partnerListings.reason, exact: true })
        .fill('Fixture review: clarify that the antenna is missing.');
      await review.getByRole('button', { name: m.common.submit, exact: true }).click();
      await expect(staff.getByText(m.partnerListings.statuses.rejected, { exact: true }).first()).toBeVisible();
      await page.reload();
      await page
        .getByRole('button')
        .filter({ hasText: `#${row.id} ·` })
        .click();
      form = page.getByRole('form', { name: m.partnerListings.listingForm });
      await form
        .getByRole('textbox', { name: m.partnerListings.fields.description, exact: true })
        .fill('Revised synthetic condition: the antenna is missing. These remain explicit disposable test views.');
      await form.getByLabel(m.partnerListings.conditionConsent, { exact: true }).check();
      await form.getByRole('button', { name: m.partnerListings.save, exact: true }).click();
      await expect(page.getByRole('button', { name: m.partnerListings.submitReview, exact: true })).toBeVisible();
      await page.getByRole('button', { name: m.partnerListings.submitReview, exact: true }).click();
      await staff.reload();
      await staff
        .getByRole('button')
        .filter({ hasText: `#${row.id} ·` })
        .click();
      review = staff.getByRole('form', { name: m.partnerListings.reviewForm });
      await review.getByRole('combobox', { name: m.partnerListings.action, exact: true }).selectOption('approve');
      await review.getByLabel(m.partnerListings.photosVerified, { exact: true }).check();
      await review.getByLabel(m.partnerListings.descriptionVerified, { exact: true }).check();
      await review
        .getByRole('textbox', { name: m.partnerListings.reason, exact: true })
        .fill('Fixture-only review of three distinct synthetic views and exact disclosed condition.');
      const approval = staff.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/admin/partner-listings/${row.id}/actions`) &&
          response.request().method() === 'POST',
      );
      await review.getByRole('button', { name: m.common.submit, exact: true }).click();
      const approved = await approval;
      expect(approved.ok()).toBeTruthy();
      row = (await approved.json()).data;
      expect(row.listingStatus).toBe('approved');
      expect((await page.request.get(`/api/products/${row.id}`)).status()).toBe(404);
      expect(await (await context.request.get('/api/admin/commerce/policies')).json()).toHaveLength(0);
      await page.reload();
      await page
        .getByRole('button')
        .filter({ hasText: `#${row.id} ·` })
        .click();
      await expect(page.getByText(m.partnerListings.statuses.approved, { exact: true }).first()).toBeVisible();
      await page.evaluate(() => scrollTo(0, 0));
      await staff.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: path.join(artifacts, `${locale}-${device.name}-listing-approved-viewport.png`) });
      await staff.screenshot({ path: path.join(artifacts, `${locale}-${device.name}-listing-review-viewport.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
      expect(await staff.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
      expect(errors).toEqual([]);
      await context.close();
    });
  }
