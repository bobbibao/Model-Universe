import { test, expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { admin, customer, hasAdmin, hasCustomer, writesEnabled } from './helpers';
import en from '../src/messages/en.json';
import vi from '../src/messages/vi.json';

const artifacts = path.resolve('../../.artifacts/model-universe/visual');
for (const locale of ['vi', 'en']) for (const width of [1440, 390]) for (const outcome of ['surplus', 'shortfall']) {
  test(`${locale} ${width} ${outcome}: signed disposal allocation and verified final money`, async ({ page, browser }) => {
    test.skip(!hasAdmin || !hasCustomer || !writesEnabled || process.env.E2E_PAWN_FIXTURE !== 'dedicated_browser_test' ||
      !process.env.E2E_PAWN_DB_NAME?.endsWith('_test') || !process.env.E2E_BUYER_EMAIL || !process.env.E2E_BUYER_PASSWORD,
    'Requires explicit disposable pawn database and separate synthetic buyer.');
    test.setTimeout(240000);
    const messages = locale === 'en' ? en : vi, labels = messages.pawnDisposal;
    const device = { width, height: width === 390 ? 844 : 1000 };
    await page.setViewportSize(device);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const staffContext = await browser.newContext({ baseURL: process.env.E2E_BASE_URL, viewport: device });
    const buyerContext = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const guestContext = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const staff = await staffContext.newPage(); staff.on('pageerror', error => errors.push(error.message));
    const post = async (request: APIRequestContext, url: string, data: Record<string, unknown>) => {
      const response = await request.post(url, { data }); expect(response.ok(), await response.text()).toBeTruthy(); return (await response.json()).data;
    };
    const upload = async (request: APIRequestContext, file: string, purpose: string) => {
      const response = await request.post('/api/evidence', { multipart: { purpose, file: { name: path.basename(file), mimeType: file.endsWith('.png') ? 'image/png' : 'image/webp', buffer: fs.readFileSync(file) } } });
      expect(response.ok(), await response.text()).toBeTruthy(); return (await response.json()).data.id;
    };
    try {
      expect((await page.request.post('/api/auth/login', { data: customer })).ok()).toBeTruthy();
      expect((await staff.request.post('/api/auth/login', { data: admin })).ok()).toBeTruthy();
      expect((await buyerContext.request.post('/api/auth/login', { data: { email: process.env.E2E_BUYER_EMAIL, password: process.env.E2E_BUYER_PASSWORD } })).ok()).toBeTruthy();
      const photos = ['strike-freedom-custom.webp', 'strike-freedom-custom-side.webp', 'strike-freedom-custom-detail.webp'].map(file => path.resolve('public/images/catalog', file));
      const evidenceIds = []; for (const file of photos) evidenceIds.push(await upload(page.request, file, 'pawn'));
      const key = randomUUID(), asset = { name: `Synthetic disposal ${locale} ${width} ${outcome} ${key.slice(0, 8)}`, modelCode: `DISPOSAL-${key.slice(0, 8)}`, version: 'Synthetic inspected custom edition', assemblyState: 'painted', boxCondition: 'No original box', accessories: 'Display stand', defects: 'Disclosed shield paint wear', repairHistory: 'Custom paint; no reported repairs' };
      let row = await post(page.request, '/api/pawn', { requestKey: key, asset, evidenceIds });
      const act = async (role: 'customer' | 'staff', data: Record<string, unknown>) => {
        row = await post(role === 'staff' ? staff.request : page.request, `/api/${role === 'staff' ? 'admin/' : ''}pawn/${row.id}/actions`, { expectedVersion: row.version, ...data });
      };
      await act('staff', { action: 'quote', appraisalVnd: 2000000, principalVnd: 1400000, termDays: 30, disposalAfterGrace: true, details: 'Explicit synthetic fixture contract, eligible disposal after grace; actual configured simple interest; separately signed D6 amendment required.' });
      await act('customer', { action: 'accept', termsAccepted: true, disposalTermsAccepted: true });
      fs.mkdirSync(artifacts, { recursive: true });
      const documentPage = await staffContext.newPage();
      await documentPage.setViewportSize({ width: 800, height: 800 });
      const signedDocument = async (name: string, details: string) => {
        await documentPage.setContent(`<main style="font:20px sans-serif;padding:48px;line-height:1.6"><h1>Model Universe automated test fixture</h1><p>Not a real contract, signature, bank payment or invoice.</p><p>${details}</p><p>Fixture collector signature: TEST COLLECTOR</p><p>Fixture staff signature: TEST ADMINISTRATOR</p><p>Unique disposable case: ${key}</p></main>`);
        const file = path.join(artifacts, `disposal-${name}-${key}.png`); await documentPage.screenshot({ path: file }); return file;
      };
      await act('customer', { action: 'attach_contract', evidenceIds: [await upload(page.request, await signedDocument('original', 'Original synthetic contract: principal 1,400,000 VND; term 30 days; explicitly eligible disposal.'), 'pawn')] });
      await act('staff', { action: 'confirm_contract', bilateralSignatureVerified: true, contractReference: `DISPOSAL-BROWSER-CONTRACT-${key}` });
      await act('staff', { action: 'receive_asset', custodyReference: `DISPOSAL-BROWSER-CUSTODY-${key}`, handoverVerified: true, conditionMatchesAgreement: true, details: 'Synthetic physical custody verified before funding.' });
      row = await post(staff.request, `/api/admin/pawn/${row.id}/disbursement`, { expectedVersion: row.version, amountVnd: 1400000, externalReference: `DISPOSAL-BROWSER-FUND-${key}`, moneyVerified: true, details: 'Synthetic confirmed disbursement on a disposable case.' });
      // Simulate elapsed time only on the newly created, uniquely keyed disposable fixture.
      const db = new Client({ host: process.env.E2E_PAWN_DB_HOST || '127.0.0.1', port: Number(process.env.E2E_PAWN_DB_PORT || 55434), user: process.env.E2E_PAWN_DB_USER || 'model_universe_test', password: process.env.E2E_PAWN_DB_PASSWORD || '', database: process.env.E2E_PAWN_DB_NAME });
      await db.connect();
      try {
        const result = await db.query('UPDATE pawn_contract SET "disbursedAt"=NOW()-INTERVAL \'35 days\', "dueAt"=NOW()-INTERVAL \'5 days\' WHERE id=$1 AND "requestKey"=$2 AND status=\'active\' RETURNING id', [row.id, key]);
        expect(result.rowCount).toBe(1);
      } finally { await db.end(); }
      row = await (await page.request.get(`/api/pawn/${row.id}`)).json();
      await staff.goto(`/${locale}/admin/pawn`); await staff.getByRole('button').filter({ hasText: `#${row.id} ·` }).click();
      const dispose = staff.getByRole('form', { name: messages.pawn.dispose, exact: true });
      await dispose.getByLabel(messages.pawn.disposalReference, { exact: true }).fill(`DISPOSAL-AUTH-${key}`);
      await dispose.getByLabel(messages.pawn.details, { exact: true }).fill('Synthetic eligible signed contract beyond grace, reviewed and authorized. No debt waived.');
      await dispose.getByRole('checkbox', { name: messages.pawn.eligibilityVerified, exact: true }).check();
      await dispose.getByRole('checkbox', { name: messages.pawn.disposalAuthorized, exact: true }).check();
      await dispose.getByRole('button', { name: messages.pawn.dispose, exact: true }).click();
      await expect(staff.getByRole('form', { name: messages.buyback.intake, exact: true })).toBeVisible();
      row = await (await page.request.get(`/api/pawn/${row.id}`)).json();
      const urls = [];
      for (const file of photos) {
        const response = await staff.request.post('/api/admin/uploads/images', { multipart: { files: { name: `synthetic-${path.basename(file)}`, mimeType: 'image/webp', buffer: fs.readFileSync(file) } } });
        expect(response.ok(), await response.text()).toBeTruthy(); urls.push((await response.json()).data.urls[0]);
      }
      const categories = await (await staff.request.get('/api/categories')).json();
      const product = await post(staff.request, '/api/admin/products', { name: asset.name, sku: `DISPOSAL-${key}`, brandName: 'Synthetic fixture manufacturer', modelCode: asset.modelCode,
        categoryId: categories.find((row: { slug: string }) => row.slug === 'gunpla').id, price: outcome === 'surplus' ? 1800000 : 1000000,
        importPrice: 0, stock: 0, isArchived: true, condition: 'preowned', assemblyState: 'painted', imageUrl: urls[0], images: urls.slice(1), includedAccessories: [asset.accessories], defects: [asset.defects] });
      row = await post(staff.request, `/api/admin/pawn/${row.id}/intake`, { expectedVersion: row.version, productId: product.id, actualPhotosVerified: true, details: 'Synthetic source-linked inventory; actual independent reference views uploaded.' });
      const order = await post(buyerContext.request, '/api/orders', { requestKey: randomUUID(), items: [{ productId: product.id, size: '', quantity: 1 }], shipping: { recipientName: 'Synthetic separate buyer', phone: '0901234567', address: 'Disposable fixture delivery address', city: 'Ho Chi Minh City' } });
      for (const status of ['SHIPPED', 'DELIVERED']) expect((await staff.request.put(`/api/admin/orders/${order.id}/status`, { data: { status } })).ok()).toBeTruthy();
      await post(staff.request, `/api/admin/orders/${order.id}/collection`, { amountVnd: order.total, externalReference: `DISPOSAL-SOURCE-SALE-${key}`, moneyVerified: true, reason: 'Synthetic actual source remittance, separate from the internal allocation.' });
      await staff.reload(); await staff.getByRole('button').filter({ hasText: `#${row.id} ·` }).click();
      const offer = staff.getByRole('form', { name: labels.offer, exact: true });
      const lineId = order.items.find((item: { productId: number }) => item.productId === product.id).id;
      await offer.getByRole('combobox', { name: labels.sale, exact: true }).selectOption(String(lineId));
      await offer.getByRole('button', { name: labels.addCost, exact: true }).click();
      await offer.getByLabel(labels.costDescription, { exact: true }).fill('Synthetic original shipping expense');
      await offer.getByLabel(labels.costAmount, { exact: true }).fill('50000');
      await offer.getByLabel(labels.costEvidence, { exact: true }).setInputFiles(await signedDocument('expense', 'Original synthetic expense: 50,000 VND, not a real invoice.'));
      await expect(offer.getByRole('button', { name: labels.offer, exact: true })).toBeEnabled();
      await offer.getByRole('button', { name: labels.offer, exact: true }).click();
      await expect(staff.getByRole('heading', { name: labels.offered, exact: true })).toBeVisible();
      await page.goto(`/${locale}/services/pawn`); await page.getByRole('button').filter({ hasText: `#${row.id} ·` }).click();
      const accept = page.getByRole('form', { name: labels.accept, exact: true });
      await accept.getByLabel(labels.signedAmendment, { exact: true }).setInputFiles(await signedDocument('amendment', 'Separate synthetic D6 amendment: costs 50,000 VND, then principal and interest; surplus to customer; shortfall retained; original terms unchanged.'));
      if (outcome === 'surplus') {
        await accept.getByLabel(labels.bankName, { exact: true }).fill('Synthetic test bank');
        await accept.getByLabel(labels.accountNumber, { exact: true }).fill('TEST-ONLY-ACCOUNT');
        await accept.getByLabel(labels.holderName, { exact: true }).fill('Synthetic test collector');
      }
      await accept.getByRole('checkbox', { name: labels.termsAccepted, exact: true }).check();
      await accept.getByRole('checkbox', { name: labels.costsAccepted, exact: true }).check();
      await expect(accept.getByRole('button', { name: labels.accept, exact: true })).toBeEnabled();
      await accept.getByRole('button', { name: labels.accept, exact: true }).click();
      await expect(page.getByRole('heading', { name: labels.accepted, exact: true })).toBeVisible();
      row = await (await page.request.get(`/api/pawn/${row.id}`)).json();
      const expenseId = row.disposalStatement.costs[0].evidenceId;
      expect((await page.request.get(`/api/evidence/${expenseId}`)).status()).toBe(200);
      expect((await buyerContext.request.get(`/api/evidence/${expenseId}`)).status()).toBe(404);
      expect((await guestContext.request.get(`/api/evidence/${expenseId}`)).status()).toBe(401);
      await staff.reload(); await staff.getByRole('button').filter({ hasText: `#${row.id} ·` }).click();
      const execute = staff.getByRole('form', { name: labels.execute, exact: true });
      await execute.getByLabel(labels.amendmentReference, { exact: true }).fill(`SIGNED-DISPOSAL-${key}`);
      await execute.getByRole('checkbox', { name: labels.signaturesVerified, exact: true }).check();
      await execute.getByRole('button', { name: labels.execute, exact: true }).click();
      const financial = staff.getByRole('form', { name: outcome === 'surplus' ? labels.surplus : labels.repayment, exact: true });
      await expect(financial).toBeVisible();
      row = await (await page.request.get(`/api/pawn/${row.id}`)).json();
      expect(row.disposal.costsVnd).toBe(50000); expect(row.disposal.interestVnd).toBe(14700);
      expect(row.disposal.remainingVnd).toBe(outcome === 'surplus' ? 0 : 464700);
      const value = outcome === 'surplus' ? row.disposal.surplusVnd : row.disposal.remainingVnd;
      await financial.getByLabel(labels.amount, { exact: true }).fill(String(value));
      await financial.getByLabel(labels.bankReference, { exact: true }).fill(`DISPOSAL-FINAL-${key}`);
      await financial.getByLabel(labels.verificationDetails, { exact: true }).fill('Synthetic completed bank payment verified against the accepted amendment.');
      await financial.getByRole('checkbox', { name: labels.moneyVerified, exact: true }).check();
      if (outcome === 'surplus') await financial.getByRole('checkbox', { name: labels.receivingAccountVerified, exact: true }).check();
      await financial.getByRole('button', { name: outcome === 'surplus' ? labels.surplus : labels.repayment, exact: true }).click();
      await expect(financial).toHaveCount(0);
      row = await (await page.request.get(`/api/pawn/${row.id}`)).json();
      expect(row.disposal.remainingVnd).toBe(0); expect(row.disposal.surplusVnd).toBe(0); expect(row.disposalSettledAt).toBeTruthy();
      expect(row.disposal.entries.map((entry: { kind: string }) => entry.kind)).toEqual(['sale', outcome === 'surplus' ? 'surplus' : 'repayment']);
      const replay = await post(staff.request, `/api/admin/pawn/${row.id}/disposal/payment`, { expectedVersion: 0, kind: outcome === 'surplus' ? 'surplus' : 'repayment', amountVnd: value, externalReference: `DISPOSAL-FINAL-${key}`, moneyVerified: true, receivingAccountVerified: outcome === 'surplus', details: 'Synthetic exact request replay.' });
      expect(replay.disposal.entries).toHaveLength(2);
      await page.reload(); await page.getByRole('button').filter({ hasText: `#${row.id} ·` }).click();
      const panel = page.getByRole('region', { name: labels.title, exact: true });
      await panel.locator('details summary').first().click();
      await expect(panel.getByRole('link', { name: labels.signedAmendment, exact: true })).toBeVisible();
      await panel.screenshot({ path: path.join(artifacts, `${locale}-${width}-disposal-${outcome}.png`) });
      await staff.getByRole('region', { name: labels.title, exact: true }).screenshot({ path: path.join(artifacts, `${locale}-${width}-staff-disposal-${outcome}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      expect(await staff.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      expect(errors).toEqual([]); await documentPage.close();
    } finally { await staffContext.close(); await buyerContext.close(); await guestContext.close(); }
  });
}
