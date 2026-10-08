import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { admin, customer, hasAdmin, hasCustomer, writesEnabled } from './helpers';
import en from '../src/messages/en.json';
import vi from '../src/messages/vi.json';

const artifacts = path.resolve('../../.artifacts/model-universe/visual');
for (const locale of ['vi', 'en']) {
  for (const device of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    test(`${locale} ${device.name}: verified COD and agreed support payout`, async ({ page, browser, request }) => {
      test.skip(!hasAdmin || !hasCustomer || !writesEnabled, 'Requires disposable verification accounts and approved test writes.');
      test.setTimeout(240000);
      const messages = locale === 'en' ? en : vi;
      const staffContext = await browser.newContext({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:6050', viewport: device });
      const staff = await staffContext.newPage();
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      staff.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize(device);
      expect((await page.request.post('/api/auth/login', { data: customer })).ok()).toBeTruthy();
      expect((await staff.request.post('/api/auth/login', { data: admin })).ok()).toBeTruthy();
      const products = (await (await request.get('/api/products?per_page=100')).json()).payload.data;
      const product = products.find((item: { stock: number; condition: string }) => item.stock > 4 && item.condition === 'new');
      expect(product).toBeTruthy();
      const created = await page.request.post('/api/orders', { data: {
        items: [{ productId: product.id, quantity: 1, size: '' }],
        shipping: { recipientName: 'Synthetic Support Collector', phone: '0901234567', address: '12 Verification Street', city: 'Fixture City' },
        requestKey: crypto.randomUUID(),
      } });
      expect(created.ok()).toBeTruthy();
      const order = (await created.json()).data;
      await staff.goto(`/${locale}/admin/orders/${order.id}`);
      for (const status of ['SHIPPED', 'DELIVERED'] as const) {
        await staff.getByRole('button', { name: messages.orderOperations.advance.replace('{status}', messages.checkout.orderStatus[status]), exact: true }).click();
        await staff.getByRole('dialog').getByRole('button', { name: messages.common.confirm, exact: true }).click();
      }
      await expect(staff.getByRole('heading', { name: messages.orderOperations.collection, exact: true })).toBeVisible();
      const unpaid = await page.request.get(`/api/orders/${order.id}`);
      expect((await unpaid.json()).paymentStatus).toBe('PENDING');
      const collectionReference = `BROWSER-COD-${order.id}`;
      await staff.getByLabel(messages.orderOperations.reference, { exact: true }).fill(collectionReference);
      await staff.getByLabel(messages.orderOperations.reason, { exact: true }).fill('Synthetic fixture remittance verified in isolated database');
      await staff.getByLabel(messages.orderOperations.verified, { exact: true }).check();
      await staff.getByRole('button', { name: messages.common.confirm, exact: true }).click();
      await expect(staff.getByText(collectionReference, { exact: true })).toBeVisible();
      expect((await (await page.request.get(`/api/orders/${order.id}`)).json()).paymentStatus).toBe('PAID');
      fs.mkdirSync(artifacts, { recursive: true });
      await staff.screenshot({ path: path.join(artifacts, `${locale}-${device.name}-cod-receipt.png`), fullPage: true });

      await page.goto(`/${locale}/order-history`);
      await page.getByRole('button', { name: messages.returns.request, exact: true }).click();
      const customerDialog = page.getByRole('dialog');
      await customerDialog.locator('select').first().selectOption('1');
      await customerDialog.getByRole('combobox', { name: messages.returns.reason, exact: true }).selectOption('missing_accessories');
      const photo = path.resolve('public/images/catalog/rg-zaku-ii-box.webp');
      // Use a real repository reference image as fixture evidence, never as a claimed customer photograph.
      expect(fs.existsSync(photo)).toBeTruthy();
      await customerDialog.getByLabel(messages.returns.evidence, { exact: true }).setInputFiles(photo);
      await expect(customerDialog.getByText(path.basename(photo), { exact: true })).toBeVisible();
      const saved = page.waitForResponse(response => response.url().endsWith('/api/returns') && response.request().method() === 'POST');
      await customerDialog.getByRole('button', { name: messages.common.submit, exact: true }).click();
      const savedResponse = await saved;
      expect(savedResponse.ok()).toBeTruthy();
      const caseId = (await savedResponse.json()).data.id;
      await expect(customerDialog).toBeHidden();
      await staff.goto(`/${locale}/admin/returns`);
      await staff.getByRole('row').filter({ has: staff.getByRole('cell', { name: `#${caseId}`, exact: true }) }).click();
      const staffDialog = staff.getByRole('dialog');
      await staffDialog.getByRole('combobox', { name: messages.supportResolution.outcome, exact: true }).selectOption('partial_refund');
      await staffDialog.getByLabel(messages.supportResolution.details, { exact: true }).fill('Synthetic fixture: agreed missing accessory payout');
      await staffDialog.getByLabel(messages.supportResolution.refund, { exact: true }).fill('40000');
      await staffDialog.getByRole('button', { name: messages.supportResolution.offer, exact: true }).click();
      await expect(staffDialog.getByText(messages.supportResolution.state.offered, { exact: true })).toBeVisible();
      await staff.screenshot({ path: path.join(artifacts, `${locale}-${device.name}-support-offer.png`), fullPage: false });

      await page.reload();
      await page.getByRole('button', { name: messages.common.details, exact: true }).click();
      await expect(page.getByRole('button', { name: messages.supportResolution.accept, exact: true })).toBeVisible();
      await page.screenshot({ path: path.join(artifacts, `${locale}-${device.name}-support-consent.png`), fullPage: true });
      await page.getByRole('button', { name: messages.supportResolution.accept, exact: true }).click();
      await expect(page.getByText(messages.supportResolution.state.accepted, { exact: true })).toBeVisible();
      await staff.reload();
      await staff.getByRole('row').filter({ has: staff.getByRole('cell', { name: `#${caseId}`, exact: true }) }).click();
      const fulfillmentDialog = staff.getByRole('dialog');
      const refundReference = `BROWSER-REFUND-${caseId}`;
      await fulfillmentDialog.getByLabel(messages.supportResolution.reference, { exact: true }).fill(refundReference);
      await fulfillmentDialog.getByLabel(messages.supportResolution.details, { exact: true }).fill('Synthetic fixture: actual payout recorded');
      await fulfillmentDialog.getByLabel(messages.supportResolution.moneyVerified, { exact: true }).check();
      await fulfillmentDialog.getByRole('button', { name: messages.supportResolution.fulfill, exact: true }).click();
      await expect(fulfillmentDialog.getByText(messages.supportResolution.state.resolved, { exact: true })).toBeVisible();
      const result = await (await page.request.get(`/api/returns/${caseId}`)).json();
      expect(result.resolutionStatus).toBe('resolved');
      expect(result.events.filter((event: { action: string }) => event.action === 'resolved')).toHaveLength(1);
      await page.reload();
      await page.getByRole('button', { name: messages.common.details, exact: true }).click();
      await expect(page.getByText(messages.supportResolution.state.resolved, { exact: true })).toBeVisible();
      await page.screenshot({ path: path.join(artifacts, `${locale}-${device.name}-support-completed.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      expect(await staff.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      expect(errors).toEqual([]);
      await staffContext.close();
    });
  }
}
