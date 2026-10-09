import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { customer, hasCustomer, writesEnabled } from './helpers';

const artifacts = path.resolve('../../.artifacts/model-universe/visual');
for (const locale of ['vi', 'en']) {
  for (const device of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    test(`${locale} ${device.name}: owned checkout, retry and cancellation`, async ({ page, request }) => {
      test.skip(!hasCustomer || !writesEnabled, 'Requires disposable verification accounts and E2E_ALLOW_WRITES=1.');
      test.setTimeout(180000);
      await page.setViewportSize(device);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const login = await page.request.post('/api/auth/login', { data: customer });
      expect(login.ok()).toBeTruthy();
      const products = (await (await request.get('/api/products?per_page=100')).json()).payload.data;
      const product = products.find((item: { stock: number; condition: string }) => item.stock > 4 && item.condition === 'new');
      expect(product).toBeTruthy();
      fs.mkdirSync(artifacts, { recursive: true });
      await page.goto(`/${locale}/shop/product/${product.id}`);
      await page.getByRole('button', { name: locale === 'en' ? 'Add to bag' : 'Thêm vào giỏ hàng', exact: true }).click();
      await page.goto(`/${locale}/cart`);
      await page.getByLabel(locale === 'en' ? 'Recipient name' : 'Họ tên người nhận', { exact: true }).fill('Browser Test Collector');
      await page.getByLabel(locale === 'en' ? 'Phone' : 'Số điện thoại', { exact: true }).fill('0901234567');
      await page.getByLabel(locale === 'en' ? 'Street address' : 'Địa chỉ', { exact: true }).fill('12 Verification Street');
      await page.getByLabel(locale === 'en' ? 'City / province' : 'Tỉnh / thành phố', { exact: true }).fill('Test City');
      await page.evaluate(() => window.scrollTo(0,0));
      await page.screenshot({ path: path.join(artifacts, `${locale}-${device.name}-checkout.png`), fullPage: true });
      let submitted: Record<string, unknown> | undefined;
      page.on('request', req => { if (req.url().endsWith('/api/orders') && req.method() === 'POST') submitted = req.postDataJSON(); });
      await page.getByRole('button', { name: locale === 'en' ? 'Review your order' : 'Kiểm tra đơn hàng', exact: true }).click();
      await page.getByRole('button', { name: locale === 'en' ? 'Place order' : 'Đặt hàng', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/thank-you\\?orderId=\\d+`));
      const orderId = Number(new URL(page.url()).searchParams.get('orderId'));
      await expect(page.getByRole('heading', { name: locale === 'en' ? 'Your next build is on its way.' : 'Mô hình tiếp theo đang đến với bạn.' })).toBeVisible();
      await page.evaluate(() => window.scrollTo(0,0));
      await page.screenshot({ path: path.join(artifacts, `${locale}-${device.name}-confirmation.png`), fullPage: true });
      expect(submitted?.requestKey).toBeTruthy();
      const replay = await page.request.post('/api/orders', { data: submitted });
      expect(replay.ok()).toBeTruthy();
      expect((await replay.json()).data.id).toBe(orderId);
      const detail = await page.request.get(`/api/orders/${orderId}`);
      expect(detail.ok()).toBeTruthy();
      const order = await detail.json();
      expect(order.items[0].modelSnapshot.grade).toBe(product.grade);
      expect(order.total).toBe(submitted?.expectedTotal);
      const cancel = await page.request.put(`/api/orders/${orderId}/cancel`);
      expect(cancel.ok()).toBeTruthy();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      expect(errors).toEqual([]);
    });
  }
}
