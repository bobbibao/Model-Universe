import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { admin, customer, hasAdmin, hasCustomer } from './helpers';

const artifacts = path.resolve('../../.artifacts/model-universe/visual');
for (const locale of ['en', 'vi']) {
  for (const device of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    test(`${locale} ${device.name}: membership and staff review with policy disabled`, async ({ page }) => {
      test.skip(!hasCustomer || !hasAdmin, 'Requires disposable verification accounts.');
      test.setTimeout(180000);
      await page.setViewportSize(device);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      expect((await page.request.post('/api/auth/login', { data: customer })).ok()).toBeTruthy();
      await page.goto(`/${locale}/services/loyalty`);
      await expect(
        page.getByRole('heading', {
          name:
            locale === 'en' ? 'Build your collection. Grow your rewards.' : 'Tích lũy bộ sưu tập. Nhận thêm ưu đãi.',
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page
          .getByRole('status')
          .filter({
            hasText:
              locale === 'en'
                ? 'Membership transactions await policy approval.'
                : 'Giao dịch thành viên đang chờ phê duyệt chính sách.',
          }),
      ).toBeVisible();
      const rewards = page.getByRole('button', { name: locale === 'en' ? 'Redeem reward' : 'Đổi thưởng', exact: true });
      expect(await rewards.count()).toBe(6);
      for (const button of await rewards.all()) await expect(button).toBeDisabled();
      await page
        .getByRole('button', { name: locale === 'en' ? 'Percentage off' : 'Giảm phần trăm', exact: true })
        .click();
      expect(await rewards.count()).toBe(6);
      for (const button of await rewards.all()) await expect(button).toBeDisabled();
      await page.getByRole('button', { name: locale === 'en' ? 'Stock gifts' : 'Quà hiện có', exact: true }).click();
      await expect(
        page.getByText(
          locale === 'en' ? 'No stock gifts are currently configured.' : 'Chưa có quà từ kho được mở đổi.',
          { exact: true },
        ),
      ).toBeVisible();
      await page.getByRole('button', { name: locale === 'en' ? 'Money off' : 'Giảm tiền', exact: true }).click();
      fs.mkdirSync(artifacts, { recursive: true });
      await page.screenshot({ path: path.join(artifacts, `${locale}-${device.name}-membership.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      await page.context().clearCookies();
      expect((await page.request.post('/api/auth/login', { data: admin })).ok()).toBeTruthy();
      await page.goto(`/${locale}/admin/loyalty`);
      await expect(
        page.getByRole('heading', {
          name: locale === 'en' ? 'Membership operations' : 'Quản lý thành viên',
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', {
          name: locale === 'en' ? 'Record a verified sales refund' : 'Ghi nhận hoàn tiền đã chi',
          exact: true,
        }),
      ).toBeVisible();
      await page.screenshot({
        path: path.join(artifacts, `${locale}-${device.name}-membership-operations.png`),
        fullPage: true,
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      expect(errors).toEqual([]);
    });
  }
}
