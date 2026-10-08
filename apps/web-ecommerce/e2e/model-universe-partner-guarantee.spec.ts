import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { admin, hasAdmin, writesEnabled } from './helpers';
import en from '../src/messages/en.json';
import vi from '../src/messages/vi.json';

const fixtureEnabled = process.env.E2E_GUARANTEE_FIXTURE === 'dedicated_partner_browser_test';
const artifacts = path.resolve('../../.artifacts/model-universe/visual');
test.beforeAll(async ({ request }) => {
  if (!fixtureEnabled || !hasAdmin || !writesEnabled) return;
  if (process.env.E2E_BASE_URL && process.env.E2E_BASE_URL !== 'http://localhost:6050')
    throw Error('Fixture policy approval is local-only.');
  const db = new Client({
    host: '127.0.0.1',
    port: 55433,
    user: 'model_universe_test',
    password: '',
    database: 'model_universe_partner_browser_test',
  });
  await db.connect();
  try {
    expect((await db.query('SELECT current_database() AS name')).rows[0].name).toBe(
      'model_universe_partner_browser_test',
    );
    expect((await request.post('/api/auth/login', { data: admin })).ok()).toBeTruthy();
    const policies = await (await request.get('/api/admin/commerce/policies')).json();
    const current = policies.find((row: { name: string }) => row.name === 'marketplace');
    if (!current) {
      expect(
        (
          await request.post('/api/admin/commerce/policies/marketplace/approve', {
            data: {
              version: 0,
              confirmApproval: true,
              reason: 'Explicit synthetic browser fixture only; no preview or retained policy approval.',
              settings: {
                commissionBasisPoints: 1000,
                guaranteeBasisPoints: 1000,
                guaranteeRounding: 'ceil',
                settlementDelayDays: 7,
                shippingAllocation: 'per_seller_quote',
              },
            },
          })
        ).ok(),
      ).toBeTruthy();
    } else expect(current.reason).toContain('fixture');
    expect(
      (await db.query("SELECT COUNT(*)::int AS count FROM commerce_policy WHERE name='marketplace'")).rows[0].count,
    ).toBe(1);
  } finally {
    await db.end();
  }
});

let customerNumber = 4;
for (const locale of ['vi', 'en'] as const)
  for (const device of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const account = ++customerNumber;
    test(`${locale} ${device.name}: accepted guarantee, verified receipt and full unused-listing refund`, async ({
      page,
      browser,
    }) => {
      test.skip(
        !fixtureEnabled || !hasAdmin || !writesEnabled,
        'Requires an explicit disposable partner database fixture.',
      );
      test.setTimeout(180000);
      const m = locale === 'en' ? en : vi,
        errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error' && /MISSING_MESSAGE|INVALID_MESSAGE/.test(message.text()))
          errors.push(message.text());
      });
      await page.setViewportSize(device);
      expect(
        (
          await page.request.post('/api/auth/login', {
            data: { email: `customer${account}@example.com`, password: 'Customer@123' },
          })
        ).ok(),
      ).toBeTruthy();
      const queue = await (await page.request.get('/api/partners/listings')).json();
      const source = queue.rows.find(
        (row: { name: string; listingStatus: string }) =>
          row.name.startsWith('Synthetic RG seller fixture') && row.listingStatus === 'approved',
      );
      expect(source).toBeTruthy();
      const model = await (await page.request.get(`/api/partners/listings/${source.id}`)).json();
      const created = await page.request.post('/api/partners/listings', {
        data: {
          requestKey: crypto.randomUUID(),
          name: `Synthetic guarantee fixture ${locale} ${device.name}`,
          brandName: model.brandName,
          modelCode: model.modelCode,
          grade: model.grade,
          scale: model.scale,
          series: model.series,
          boxCondition: model.boxCondition,
          condition: model.condition,
          assemblyState: model.assemblyState,
          description: model.description,
          includedAccessories: model.includedAccessories,
          defects: model.defects,
          categoryId: model.categoryId,
          price: 1350001,
          stock: 1,
          dispatchDays: 2,
          conditionConfirmed: true,
          photoIds: model.photos.map((photo: { id: number }) => photo.id),
        },
      });
      expect(created.ok()).toBeTruthy();
      let row = (await created.json()).data;
      const submitted = await page.request.post(`/api/partners/listings/${row.id}/actions`, {
        data: { action: 'submit', expectedVersion: row.listingVersion },
      });
      expect(submitted.ok()).toBeTruthy();
      row = (await submitted.json()).data;
      const context = await browser.newContext({ baseURL: 'http://localhost:6050', viewport: device });
      try {
        const staff = await context.newPage();
        staff.on('pageerror', (error) => errors.push(error.message));
        expect((await staff.request.post('/api/auth/login', { data: admin })).ok()).toBeTruthy();
        const approved = await staff.request.post(`/api/admin/partner-listings/${row.id}/actions`, {
          data: {
            action: 'approve',
            expectedVersion: row.listingVersion,
            reason: 'Fixture reviewed actual synthetic photos and condition',
            actualPhotosVerified: true,
            descriptionVerified: true,
          },
        });
        expect(approved.ok()).toBeTruthy();
        row = (await approved.json()).data;
        const open = async () => {
          await page.goto(`/${locale}/partner/inventory`);
          await page
            .getByRole('button')
            .filter({ hasText: `#${row.id} ·` })
            .click();
        };
        const staffOpen = async () => {
          await staff.goto(`/${locale}/admin/partner-listings`);
          await staff
            .getByRole('button')
            .filter({ hasText: `#${row.id} ·` })
            .click();
        };
        await open();
        const guarantee = page.getByRole('article', { name: m.partnerGuarantee.title, exact: true });
        await guarantee.getByRole('checkbox', { name: m.partnerGuarantee.consent, exact: true }).check();
        const acceptedResponse = page.waitForResponse(
          (response) =>
            response.url().endsWith(`/api/partners/listings/${row.id}/guarantee`) &&
            response.request().method() === 'POST',
        );
        await guarantee.getByRole('button', { name: m.partnerGuarantee.accept, exact: true }).click();
        const accepted = await acceptedResponse;
        expect(accepted.ok()).toBeTruthy();
        const terms = (await accepted.json()).data.guarantees[0];
        expect(terms.requiredVnd).toBe(135001);
        await expect(page.getByRole('form', { name: m.partnerListings.listingForm, exact: true })).toHaveCount(0);
        await staffOpen();
        const transfer = async (kind: 'receipt' | 'refund') => {
          const form = staff.getByRole('form', { name: m.partnerGuarantee.transferForm, exact: true });
          await form.getByLabel(m.partnerGuarantee.amount, { exact: true }).fill('135001');
          const reference = `BROWSER-GUARANTEE-${row.id}-${kind.toUpperCase()}`;
          await form.getByLabel(m.partnerGuarantee.reference, { exact: true }).fill(reference);
          await form
            .getByRole('textbox', { name: m.partnerGuarantee.reason, exact: true })
            .fill('Synthetic actual-transfer verification in the disposable browser fixture.');
          await form.getByRole('checkbox', { name: m.partnerGuarantee.moneyVerified, exact: true }).check();
          if (kind === 'refund')
            await form.getByRole('checkbox', { name: m.partnerGuarantee.bankVerified, exact: true }).check();
          const response = staff.waitForResponse(
            (response) =>
              response.url().endsWith(`/api/admin/partner-listings/${row.id}/guarantee`) &&
              response.request().method() === 'POST',
          );
          await form.getByRole('button', { name: m.common.submit, exact: true }).click();
          const result = await response;
          expect(result.ok()).toBeTruthy();
          return (await result.json()).data.guarantees[0];
        };
        const received = await transfer('receipt');
        expect(received.heldVnd).toBe(135001);
        expect(received.payments).toHaveLength(1);
        await open();
        fs.mkdirSync(artifacts, { recursive: true });
        await guarantee.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: path.join(artifacts, `${locale}-${device.name}-guarantee-received.png`),
          fullPage: true,
        });
        await page.getByRole('button', { name: m.partnerListings.withdraw, exact: true }).click();
        await expect(page.getByRole('status').filter({ hasText: m.partnerListings.statuses.hidden })).toBeVisible();
        await staffOpen();
        const refunded = await transfer('refund');
        expect(refunded.heldVnd).toBe(0);
        expect(refunded.payments).toHaveLength(2);
        await open();
        await expect(guarantee.getByText(`BROWSER-GUARANTEE-${row.id}-REFUND`, { exact: true })).toBeVisible();
        expect((await page.request.get(`/api/products/${row.id}`)).status()).toBe(404);
        for (const view of [page, staff]) {
          expect(await view.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        }
        await guarantee.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: path.join(artifacts, `${locale}-${device.name}-guarantee-refunded.png`),
          fullPage: true,
        });
        expect(errors).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
