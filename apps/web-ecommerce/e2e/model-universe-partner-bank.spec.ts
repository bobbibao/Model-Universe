import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { admin, hasAdmin, writesEnabled } from './helpers';
import en from '../src/messages/en.json';
import vi from '../src/messages/vi.json';

let customerNumber = Number(process.env.E2E_PARTNER_CUSTOMER_OFFSET || 8);
for (const locale of ['vi', 'en'] as const) for (const viewport of [
  { width: 1440, height: 1000 }, { width: 390, height: 844 },
]) {
  const customer = ++customerNumber;
  test(`${locale} ${viewport.width}: private payout account verification and voluntary closure`, async ({ page, browser }) => {
    test.skip(!hasAdmin || !writesEnabled || process.env.E2E_PARTNER_FIXTURE !== 'dedicated_partner_browser_test', 'Requires verified sellers with no obligations in the disposable partner database.');
    test.setTimeout(180000);
    const m = locale === 'en' ? en : vi;
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    expect((await page.request.post('/api/auth/login', { data: { email: `customer${customer}@example.com`, password: 'Customer@123' } })).ok()).toBeTruthy();
    let initial = await (await page.request.get('/api/partners/application')).json();
    if (!initial) {
      const scan = await browser.newPage();
      await scan.setContent('<main style="padding:40px;font:24px Arial;border:8px solid orange"><h1>SYNTHETIC IDENTITY FIXTURE</h1><p>Not a real identity document. Disposable browser test only.</p></main>');
      const buffer = await scan.screenshot(); await scan.close();
      const uploaded = await page.request.post('/api/evidence', { multipart: { purpose: 'partner_verification', file: { name: 'synthetic-identity.png', mimeType: 'image/png', buffer } } });
      expect(uploaded.ok()).toBeTruthy();
      const created = await page.request.post('/api/partners/application', { data: { requestKey: crypto.randomUUID(), termsAccepted: true,
        evidenceIds: [(await uploaded.json()).data.id], application: { legalName: `Synthetic Bank Seller ${customer}`, displayName: `Synthetic Bank Review ${locale} ${viewport.width}`, phone: '0901234567', pickupAddress: '12 Synthetic Fixture Road', experience: 'Synthetic verification and closure test only.', bankName: 'Synthetic Old Bank', bankAccount: `00112200${customer}`, accountHolder: `Synthetic Bank Seller ${customer}` } } });
      expect(created.ok()).toBeTruthy();
      initial = (await created.json()).data;
      const adminContext = await browser.newContext();
      expect((await adminContext.request.post('/api/auth/login', { data: admin })).ok()).toBeTruthy();
      const verified = await adminContext.request.post(`/api/admin/partners/${initial.id}/actions`, { data: { action: 'verify', expectedVersion: initial.version, identityVerified: true, bankVerified: true, maxListings: 3, maxListingValueVnd: 2000000, reason: 'Disposable fixture identity and matching synthetic bank checks.' } });
      expect(verified.ok()).toBeTruthy(); initial = (await verified.json()).data;
      await adminContext.close();
    }
    expect(initial.status).toBe('verified');
    expect(initial.pendingBankChange).toBeNull();
    const originalBank = initial.application.bankAccount;
    await page.goto(`/${locale}/services/partner`);
    const form = page.getByRole('form', { name: m.partnerBank.form });
    await expect(form).toBeVisible();
    await form.getByLabel(m.partnerBank.bankName, { exact: true }).fill('SYNTHETIC NEW BANK');
    await form.getByLabel(m.partnerBank.bankAccount, { exact: true }).fill(`88990000${customer}`);
    await form.getByLabel(m.partnerBank.accountHolder, { exact: true }).fill(initial.application.accountHolder);
    const scan = await browser.newPage();
    await scan.setContent('<main style="padding:40px;font:24px Arial;border:8px solid orange"><h1>SYNTHETIC BANK VERIFICATION FIXTURE</h1><p>This is not a bank document. Disposable browser test only.</p></main>');
    const proof = await scan.screenshot(); await scan.close();
    await form.getByLabel(m.partnerBank.photos, { exact: true }).setInputFiles({ name: 'synthetic-bank-proof.png', mimeType: 'image/png', buffer: proof });
    await form.getByLabel(m.partnerBank.reason, { exact: true }).fill('Fixture-only account change with matching synthetic holder.');
    await form.getByLabel(m.partnerBank.consent, { exact: true }).check();
    await expect(form.getByRole('button', { name: m.common.submit, exact: true })).toBeEnabled();
    const submitted = page.waitForResponse(response => response.url().endsWith(`/api/partners/application/${initial.id}/actions`) && response.request().method() === 'POST');
    await form.getByRole('button', { name: m.common.submit, exact: true }).click();
    const response = await submitted; expect(response.ok()).toBeTruthy();
    const pending = (await response.json()).data;
    expect(pending.application.bankAccount).toBe(originalBank);
    expect(pending.bankVerifiedAt).toBeNull();
    await expect(page.getByText(m.partnerBank.pending, { exact: true })).toBeVisible();
    await expect(form).toHaveCount(0);
    const context = await browser.newContext({ viewport });
    const staff = await context.newPage(); staff.on('pageerror', error => errors.push(error.message));
    expect((await context.request.post('/api/auth/login', { data: admin })).ok()).toBeTruthy();
    await staff.goto(`/${locale}/admin/partners`);
    await staff.getByRole('button').filter({ hasText: `#${initial.id}` }).click();
    const review = staff.getByRole('form', { name: m.partner.reviewForm });
    await review.getByRole('combobox', { name: m.partner.action, exact: true }).selectOption('verify_bank_change');
    await review.getByLabel(m.partner.bankCheck, { exact: true }).check();
    await review.getByLabel(m.partner.reason, { exact: true }).fill('Fixture-only matching new account verification.');
    const confirmed = staff.waitForResponse(response => response.url().endsWith(`/api/admin/partners/${initial.id}/actions`) && response.request().method() === 'POST');
    await review.getByRole('button', { name: m.common.submit, exact: true }).click();
    const confirmedResponse = await confirmed; expect(confirmedResponse.ok()).toBeTruthy();
    expect((await confirmedResponse.json()).data.application.bankAccount).toBe(`88990000${customer}`);
    await page.reload(); await expect(form).toBeVisible();
    await form.getByRole('combobox', { name: m.partnerBank.action, exact: true }).selectOption('request_close');
    await form.getByLabel(m.partnerBank.reason, { exact: true }).fill('Fixture-only voluntary closure with no obligations.');
    await form.getByLabel(m.partnerBank.consent, { exact: true }).check();
    await form.getByRole('button', { name: m.common.submit, exact: true }).click();
    await expect(page.getByText(`#${initial.id} · ${m.partner.statuses.closed}`, { exact: true })).toBeVisible();
    const retained = await (await page.request.get('/api/partners/application')).json();
    expect(retained.application.bankAccount).toBe(`88990000${customer}`);
    expect(retained.events.some((event: { action: string }) => event.action === 'seller_closed')).toBeTruthy();
    fs.mkdirSync(path.resolve('../../.artifacts/model-universe/visual'), { recursive: true });
    await page.screenshot({ path: path.resolve(`../../.artifacts/model-universe/visual/${locale}-${viewport.width}-partner-bank-closed.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    expect(await staff.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    expect(errors).toEqual([]); await context.close();
  });
}
