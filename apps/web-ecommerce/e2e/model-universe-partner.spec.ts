import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { admin, hasAdmin, writesEnabled } from './helpers';
import en from '../src/messages/en.json';
import vi from '../src/messages/vi.json';

const artifacts = path.resolve('../../.artifacts/model-universe/visual');
let fixtureIndex = Number(process.env.E2E_PARTNER_CUSTOMER_OFFSET || 0);
for (const locale of ['vi', 'en'] as const) {
  for (const device of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const customerNumber = ++fixtureIndex;
    test(`${locale} ${device.name}: private seller application, revision and verified limits`, async ({
      page,
      browser,
    }) => {
      test.skip(
        !hasAdmin || !writesEnabled || process.env.E2E_PARTNER_FIXTURE !== 'dedicated_partner_browser_test',
        'Requires the dedicated disposable partner browser database.',
      );
      test.setTimeout(180000);
      const m = locale === 'en' ? en : vi;
      await page.setViewportSize(device);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      expect(
        (
          await page.request.post('/api/auth/login', {
            data: { email: `customer${customerNumber}@example.com`, password: 'Customer@123' },
          })
        ).ok(),
      ).toBeTruthy();
      await page.goto(`/${locale}/services/partner`);
      const form = page.getByRole('form', { name: m.partner.applicationForm });
      await expect(form).toBeVisible();
      const values = {
        legalName: `Synthetic Seller ${customerNumber}`,
        displayName: `Synthetic Collector ${locale} ${device.name}`,
        phone: '0901234567',
        pickupAddress: '12 Synthetic Dispatch Road',
        experience: 'Fixture inspection process: check every runner and disclose missing parts.',
        bankName: 'Synthetic Test Bank',
        bankAccount: `001234567${customerNumber}`,
        accountHolder: `Synthetic Seller ${customerNumber}`,
      };
      for (const [key, value] of Object.entries(values))
        await form.getByLabel(m.partner.fields[key as keyof typeof values], { exact: true }).fill(value);
      const scan = await browser.newPage({ viewport: { width: 800, height: 500 } });
      await scan.setContent(
        '<main style="font-family:Arial;padding:48px;border:8px solid #f59e0b"><h1>SYNTHETIC VERIFICATION FIXTURE</h1><p>This is not an identity document, bank proof or legal signature.</p><p>For disposable Model Universe browser tests only.</p></main>',
      );
      fs.mkdirSync(artifacts, { recursive: true });
      const proof = path.join(artifacts, `${locale}-${device.name}-synthetic-partner-proof.png`);
      await scan.screenshot({ path: proof });
      await scan.close();
      await form.getByLabel(m.partner.identityPhotos, { exact: true }).setInputFiles(proof);
      await form.getByLabel(m.partner.consent, { exact: true }).check();
      await expect(form.getByRole('button', { name: m.common.submit, exact: true })).toBeEnabled();
      const create = page.waitForResponse(
        (response) => response.url().endsWith('/api/partners/application') && response.request().method() === 'POST',
      );
      await form.getByRole('button', { name: m.common.submit, exact: true }).click();
      const response = await create;
      expect(response.ok()).toBeTruthy();
      let row = (await response.json()).data;
      expect(row.status).toBe('submitted');
      expect(row).not.toHaveProperty('requestDigest');
      const context = await browser.newContext({ viewport: device });
      const staff = await context.newPage();
      staff.on('pageerror', (error) => errors.push(error.message));
      expect((await context.request.post('/api/auth/login', { data: admin })).ok()).toBeTruthy();
      await staff.goto(`/${locale}/admin/partners`);
      await staff
        .getByRole('button')
        .filter({ hasText: `#${row.id}` })
        .click();
      let review = staff.getByRole('form', { name: m.partner.reviewForm });
      await review.getByRole('combobox', { name: m.partner.action, exact: true }).selectOption('request_changes');
      await review
        .getByLabel(m.partner.reason, { exact: true })
        .fill('Synthetic review: revise the account-holder spelling.');
      await review.getByRole('button', { name: m.common.submit, exact: true }).click();
      await expect(staff.getByText(m.partner.statuses.changes_requested, { exact: true }).first()).toBeVisible();
      await page.reload();
      await expect(form).toBeVisible();
      await form
        .getByLabel(m.partner.fields.accountHolder, { exact: true })
        .fill(`Verified Synthetic Seller ${customerNumber}`);
      await form.getByLabel(m.partner.consent, { exact: true }).check();
      const revise = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/partners/application/${row.id}/actions`) &&
          response.request().method() === 'POST',
      );
      await form.getByRole('button', { name: m.common.submit, exact: true }).click();
      expect((await revise).ok()).toBeTruthy();
      await staff.reload();
      await staff
        .getByRole('button')
        .filter({ hasText: `#${row.id}` })
        .click();
      review = staff.getByRole('form', { name: m.partner.reviewForm });
      await review.getByRole('combobox', { name: m.partner.action, exact: true }).selectOption('verify');
      await review.getByLabel(m.partner.maxListings, { exact: true }).fill('3');
      await review.getByLabel(m.partner.maxValue, { exact: true }).fill('2000000');
      await review.getByLabel(m.partner.identityCheck, { exact: true }).check();
      await review.getByLabel(m.partner.bankCheck, { exact: true }).check();
      await review
        .getByLabel(m.partner.reason, { exact: true })
        .fill('Fixture-only verification of synthetic identity and matching synthetic account.');
      const verify = staff.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/admin/partners/${row.id}/actions`) && response.request().method() === 'POST',
      );
      await review.getByRole('button', { name: m.common.submit, exact: true }).click();
      const verified = await verify;
      expect(verified.ok()).toBeTruthy();
      row = (await verified.json()).data;
      expect(row.status).toBe('verified');
      expect(row.maxListings).toBe(3);
      expect((await context.request.get('/api/admin/commerce/policies')).ok()).toBeTruthy();
      expect(await (await context.request.get('/api/admin/commerce/policies')).json()).toHaveLength(0);
      await page.reload();
      await expect(page.getByText(m.partner.statuses.verified, { exact: true })).toBeVisible();
      await expect(form).toHaveCount(0);
      await page.evaluate(() => scrollTo(0, 0));
      await staff.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: path.join(artifacts, `${locale}-${device.name}-partner-verified-viewport.png`) });
      await staff.screenshot({ path: path.join(artifacts, `${locale}-${device.name}-partner-review-viewport.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
      expect(await staff.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
      expect(errors).toEqual([]);
      await context.close();
    });
  }
}
