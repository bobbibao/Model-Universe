import { test, expect } from '@playwright/test';
import fs from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';
import { admin, customer, hasAdmin, hasCustomer, writesEnabled } from './helpers';
import en from '../src/messages/en.json';
import vi from '../src/messages/vi.json';

const artifacts = path.resolve('../../.artifacts/model-universe/visual');
for (const locale of ['vi', 'en']) {
  for (const device of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    test(`${locale} ${device.name}: private appraisal and optional isolated full ownership/intake flow`, async ({ page, browser }) => {
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
      const modelName = `Browser inspection fixture ${locale} ${device.name} ${randomUUID().slice(0, 8)}`;
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
      const fullFlow = process.env.E2E_BUYBACK_FIXTURE === 'dedicated_browser_test';
      if (fullFlow) {
        // Explicit opt-in on the disposable browser database; never promote these terms to a retained environment.
        const policies = await (await staff.request.get('/api/admin/commerce/policies')).json();
        const policy = policies.find((entry: { name: string }) => entry.name === 'buyback');
        if (policy) expect(policy.settings.inboundCod).toBe('not_supported');
        else expect((await staff.request.post('/api/admin/commerce/policies/buyback/approve', { data: {
          version: 0, settings: { inboundCod: 'not_supported' }, confirmApproval: true,
          reason: 'Disposable browser fixture only: non-COD inspection shipment. Not an owner approval.',
        } })).ok()).toBeTruthy();
      }
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
      if (fullFlow) {
        const customerDetail = page.locator('#buyback-detail');
        const staffDetail = staff.locator('#buyback-detail');
        const mutate = async (actor: typeof page, endpoint: string, click: () => Promise<unknown>) => {
          const response = actor.waitForResponse(value => value.url().endsWith(endpoint) && value.request().method() === 'POST');
          await click();
          const received = await response;
          expect(received.ok(), await received.text()).toBeTruthy();
          return (await received.json()).data;
        };
        const reopenStaff = async () => {
          await staff.reload();
          await staff.getByRole('button').filter({ hasText: `#${row.id} ·` }).click();
        };
        await customerDetail.getByLabel(messages.buyback.tracking, { exact: true }).fill(`FIXTURE-INBOUND-${row.id}`);
        await mutate(page, `/api/buyback/${row.id}/actions`, () => customerDetail.getByRole('button', { name: messages.buyback.sendItem, exact: true }).click());
        await reopenStaff();
        await staffDetail.getByLabel(messages.buyback.details, { exact: true }).fill('Synthetic physical inspection: shield wear confirmed; revised price below the photo estimate.');
        await staffDetail.getByRole('checkbox', { name: messages.buyback.handoverVerified, exact: true }).check();
        await mutate(staff, `/api/admin/buyback/${row.id}/actions`, () => staffDetail.getByRole('button', { name: messages.buyback.inspect, exact: true }).click());
        await staffDetail.getByLabel(messages.buyback.amount, { exact: true }).fill('850000');
        await staffDetail.getByLabel(messages.buyback.details, { exact: true }).fill('Synthetic final quote revised after physical inspection; condition evidence retained.');
        await mutate(staff, `/api/admin/buyback/${row.id}/actions`, () => staffDetail.getByRole('button', { name: messages.buyback.finalOffer, exact: true }).click());
        await page.reload();
        await page.getByRole('button').filter({ hasText: `#${row.id} ·` }).click();
        await expect(customerDetail.getByText(messages.buyback.finalNote, { exact: true })).toBeVisible();
        const accepted = await mutate(page, `/api/buyback/${row.id}/actions`, () => customerDetail.getByRole('button', { name: messages.buyback.accept, exact: true }).click());
        expect(accepted.status).toBe('awaiting_payout');
        expect(accepted.payout).toBeNull();
        expect(accepted.ownershipTransferredAt).toBeNull();
        await reopenStaff();
        await staffDetail.getByLabel(messages.buyback.reference, { exact: true }).fill(`FIXTURE-BUYBACK-${randomUUID()}`);
        await staffDetail.getByLabel(messages.buyback.details, { exact: true }).fill('Synthetic executed payout verified for the accepted 850000 VND quote. No real bank transfer.');
        await staffDetail.getByRole('checkbox', { name: messages.buyback.moneyVerified, exact: true }).check();
        const paid = await mutate(staff, `/api/admin/buyback/${row.id}/payout`, () => staffDetail.getByRole('button', { name: messages.buyback.pay, exact: true }).click());
        expect(paid.status).toBe('completed');
        expect(paid.payout.amountVnd).toBe(850000);
        expect(paid.ownershipTransferredAt).toBeTruthy();

        // Prepare an actual archived draft through existing staff APIs, then select and activate it through the UI.
        const urls: string[] = [];
        for (const file of photos) {
          const uploaded = await staff.request.post('/api/admin/uploads/images', { multipart: {
            files: { name: `synthetic-intake-${path.basename(file)}`, mimeType: 'image/webp', buffer: fs.readFileSync(file) },
          } });
          expect(uploaded.ok()).toBeTruthy();
          urls.push((await uploaded.json()).data.urls[0]);
        }
        const categories = await (await staff.request.get('/api/categories')).json();
        const draftName = `Synthetic buyback intake ${row.id}`;
        const draftResponse = await staff.request.post('/api/admin/products', { data: {
          name: draftName, sku: `BUYBACK-BROWSER-${row.id}`, brandName: 'Synthetic test manufacturer',
          modelCode: fields.modelCode, categoryId: categories.find((entry: { slug: string }) => entry.slug === 'gunpla').id,
          price: 1000000, importPrice: 0, stock: 0, isArchived: true, condition: 'preowned', assemblyState: 'painted',
          imageUrl: urls[0], images: urls.slice(1), includedAccessories: [fields.accessories], defects: [fields.defects],
        } });
        expect(draftResponse.ok(), await draftResponse.text()).toBeTruthy();
        const draft = (await draftResponse.json()).data;
        await staffDetail.getByRole('textbox', { name: messages.productPicker.search, exact: true }).fill(draftName);
        await staffDetail.getByRole('button').filter({ hasText: `${draft.id} - ${draftName}` }).click();
        await staffDetail.getByLabel(messages.buyback.details, { exact: true }).fill('Synthetic actual public views match the accepted inspection; source inventory remains unique.');
        await staffDetail.getByRole('checkbox', { name: messages.buyback.actualPhotosVerified, exact: true }).check();
        const stocked = await mutate(staff, `/api/admin/buyback/${row.id}/intake`, () => staffDetail.getByRole('button', { name: messages.buyback.intake, exact: true }).click());
        expect(stocked.productId).toBe(draft.id);
        expect(stocked.events.filter((entry: { action: string }) => entry.action === 'payout')).toHaveLength(1);
        expect(stocked.events.filter((entry: { action: string }) => entry.action === 'intake')).toHaveLength(1);
        const replay = await staff.request.post(`/api/admin/buyback/${row.id}/intake`, { data: {
          expectedVersion: paid.version, productId: draft.id, actualPhotosVerified: true, details: 'Synthetic retry of the same source intake.',
        } });
        expect(replay.ok()).toBeTruthy();
        expect((await replay.json()).data.events.filter((entry: { action: string }) => entry.action === 'intake')).toHaveLength(1);
        const publicProduct = await (await page.request.get(`/api/products/${draft.id}`)).json();
        expect(publicProduct.stock).toBe(1);
        expect(publicProduct.condition).toBe('preowned');
        const storedProduct = await (await staff.request.get(`/api/admin/products/${draft.id}`)).json();
        expect(storedProduct.importPrice).toBe(850000);
        await page.reload();
        await page.getByRole('button').filter({ hasText: `#${row.id} ·` }).click();
        await expect(customerDetail.getByText(messages.buyback.paid, { exact: true })).toBeVisible();
        await page.screenshot({ path: path.join(artifacts, `${locale}-${device.name}-buyback-complete.png`), fullPage: true });
        await staff.screenshot({ path: path.join(artifacts, `${locale}-${device.name}-buyback-intake.png`), fullPage: true });
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      expect(await staff.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      expect(errors).toEqual([]);
      await staffContext.close();
    });
  }
}
