import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { admin, hasAdmin, writesEnabled } from './helpers';
import en from '../src/messages/en.json';
import vi from '../src/messages/vi.json';

let index = Number(process.env.E2E_CUSTOMER_TOOLS_OFFSET || 16);
for (const locale of ['vi', 'en'] as const) for (const viewport of [
  { width: 1440, height: 1000 }, { width: 390, height: 844 },
]) {
  const customer = ++index;
  test(`${locale} ${viewport.width}: saved checkout address, actual restock inbox and catalog finder`, async ({ page, browser }) => {
    test.skip(!hasAdmin || !writesEnabled || process.env.E2E_CUSTOMER_TOOLS_FIXTURE !== 'dedicated_partner_browser_test', 'Requires the named disposable commerce browser database.');
    test.setTimeout(240000);
    const m = locale === 'en' ? en : vi, artifacts = path.resolve('../../.artifacts/model-universe/visual');
    fs.mkdirSync(artifacts, { recursive: true }); await page.setViewportSize(viewport);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    expect((await page.request.post('/api/auth/login', { data: { email: `customer${customer}@example.com`, password: 'Customer@123' } })).ok()).toBeTruthy();
    const staff = await browser.newContext(); expect((await staff.request.post('/api/auth/login', { data: admin })).ok()).toBeTruthy();
    const catalog = await (await staff.request.get('/api/admin/products?per_page=100')).json();
    const source = catalog.payload.data.find((row: { partnerId: number | null }) => !row.partnerId);
    const detail = await (await staff.request.get(`/api/admin/products/${source.id}`)).json();
    const sku = `TOOLS-BROWSER-${crypto.randomUUID()}`;
    const created = await staff.request.post('/api/admin/products', { data: { name: `Synthetic discovery ${locale} ${viewport.width} ${sku.slice(-8)}`, sku, brandName: 'Synthetic Fixture Manufacturer', categoryId: detail.categoryId,
      price: 200000, importPrice: 0, stock: 0, imageUrl: detail.imageUrl, grade: 'HG', condition: 'new', assemblyState: 'unassembled', availableSizes: [], descriptionEn: 'Disposable fixture. Reference image is not actual merchandise evidence.', descriptionVi: 'Dữ liệu kiểm thử riêng. Ảnh tham khảo không phải bằng chứng hàng thực tế.' } });
    expect(created.ok()).toBeTruthy(); const product = (await created.json()).data;
    await page.goto(`/${locale}/account/addresses`);
    const form = page.getByRole('form', { name: m.customerTools.addressForm }); await expect(form).toBeVisible();
    const label = `Synthetic home ${crypto.randomUUID()}`;
    await form.getByLabel(m.customerTools.addressLabel, { exact: true }).fill(label);
    for (const [key, value] of Object.entries({ recipientName: 'Synthetic Delivery Collector', phone: '0901234567', address: '12 Synthetic Saved Address', city: 'Synthetic City' }))
      await form.getByLabel(m.checkout[key as keyof typeof m.checkout] as string, { exact: true }).fill(value);
    const savedResponse = page.waitForResponse(response => response.url().endsWith('/api/addresses') && response.request().method() === 'POST');
    await form.getByRole('button', { name: m.common.submit, exact: true }).click();
    const saved = await savedResponse; expect(saved.ok()).toBeTruthy(); const address = (await saved.json()).data;
    await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
    await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: path.join(artifacts, `${locale}-${viewport.width}-address-book.png`), fullPage: true });
    await page.goto(`/${locale}/shop/product/${product.id}`);
    await expect(page.getByRole('button', { name: m.customerTools.startAlert, exact: true })).toBeVisible();
    await page.getByRole('button', { name: m.customerTools.startAlert, exact: true }).click();
    await expect(page.getByText(m.customerTools.alertActive, { exact: true })).toBeVisible();
    const suppliers = await (await staff.request.get('/api/admin/suppliers?per_page=100')).json();
    const supplier = suppliers.payload.data.find((row: { isActive: boolean }) => row.isActive);
    expect(supplier).toBeTruthy();
    const received = await staff.request.post('/api/admin/stock-imports', { data: { supplierId: supplier.id, note: 'Synthetic browser goods-receipt fixture only.', items: [{ productId: product.id, quantity: 2, importPrice: 100000 }] } });
    expect(received.ok()).toBeTruthy();
    await expect.poll(async () => {
      const result = await (await page.request.get('/api/notifications')).json();
      return result.rows.filter((row: { kind: string; entityId: number }) => row.kind === 'restock' && row.entityId === product.id).length;
    }, { timeout: 75000, intervals: [1000, 2000, 5000] }).toBe(1);
    await page.goto(`/${locale}/account/notifications`);
    const notification = page.locator('article').filter({ has: page.getByText(product.name, { exact: true }) });
    await expect(notification).toBeVisible(); await notification.getByRole('button', { name: m.customerTools.markRead, exact: true }).click();
    await expect(notification.getByText(m.customerTools.read, { exact: true })).toBeVisible();
    await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: path.join(artifacts, `${locale}-${viewport.width}-customer-inbox.png`), fullPage: true });
    await page.goto(`/${locale}/kit-finder`);
    const finder = page.getByRole('form', { name: m.customerTools.finderForm });
    await finder.getByRole('combobox', { name: m.catalog.grade, exact: true }).selectOption('HG');
    await finder.getByLabel(m.customerTools.budget, { exact: true }).fill('200000');
    await finder.getByRole('button', { name: m.customerTools.findModels, exact: true }).click();
    await expect(page.getByRole('link', { name: product.name, exact: true }).last()).toBeVisible();
    await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: path.join(artifacts, `${locale}-${viewport.width}-kit-finder.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await page.goto(`/${locale}/shop/product/${product.id}`);
    await page.getByRole('button', { name: m.catalog.addToCart, exact: true }).click();
    await page.goto(`/${locale}/cart`);
    await page.getByRole('combobox', { name: m.customerTools.savedAddress, exact: true }).selectOption(String(address.id));
    await expect(page.getByLabel(m.checkout.address, { exact: true })).toHaveValue('12 Synthetic Saved Address');
    await expect(page.getByLabel(m.checkout.recipientName, { exact: true })).toHaveValue('Synthetic Delivery Collector');
    await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: path.join(artifacts, `${locale}-${viewport.width}-saved-address-checkout.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy(); expect(errors).toEqual([]);
    expect((await page.request.post(`/api/addresses/${address.id}/remove`, { data: { expectedVersion: address.version } })).ok()).toBeTruthy();
    expect((await staff.request.delete(`/api/admin/products/${product.id}`)).ok()).toBeTruthy(); await staff.close();
  });
}
