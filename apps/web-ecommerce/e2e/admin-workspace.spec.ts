import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { admin, hasAdmin, signIn } from './helpers';
import { adminDestinations } from '../src/components/Admin/navigation';

const screenshots = process.env.E2E_ADMIN_SCREENSHOTS || '.artifacts/admin-workspace';

for (const locale of ['vi', 'en']) {
  for (const device of ['desktop', 'mobile']) {
    test(`${locale} ${device}: every admin destination renders without overflow or runtime errors`, async ({
      page,
    }) => {
      test.skip(!hasAdmin, 'Requires an existing synthetic admin account');
      test.setTimeout(240_000);
      await page.setViewportSize(device === 'desktop' ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
      const failures: string[] = [];
      page.on('pageerror', (error) => failures.push(error.message));
      await signIn(page, admin, '/admin/dashboard');
      await page.waitForURL('**/admin/dashboard');
      await page.evaluate(
        (theme) => localStorage.setItem('color-theme', JSON.stringify(theme)),
        device === 'desktop' ? 'light' : 'dark',
      );
      await mkdir(screenshots, { recursive: true });
      const timings: { route: string; loadMs: number }[] = [];
      for (const route of [...adminDestinations.map((item) => item.route), '/admin/products/new']) {
        await test.step(route, async () => {
          const started = Date.now();
          const response = await page.goto(`/${locale}${route}`);
          expect.soft(response?.status(), route).toBe(200);
          await expect(page.locator('.admin-page h1').first(), route).toBeVisible();
          await expect(page.locator('.admin-table[aria-busy="true"]'), route).toHaveCount(0);
          await page.waitForTimeout(250);
          expect
            .soft(
              await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
              `${route}: viewport overflow`,
            )
            .toBe(true);
          expect
            .soft(await page.locator('main').innerText(), `${route}: missing translations`)
            .not.toMatch(/adminWorkspace\.descriptions\.|MISSING_MESSAGE|Application error/);
          if (route === '/admin/reservations') {
            await expect(page.locator('.admin-page a[href$="/shop"]')).toHaveCount(0);
          }
          if (device === 'mobile' && route === '/admin/products') {
            const title = await page.locator('.admin-table-toolbar h2').boundingBox();
            const actions = await page.locator('.admin-table-actions').boundingBox();
            expect(actions!.y).toBeGreaterThanOrEqual(title!.y + title!.height);
          }
          timings.push({ route, loadMs: Date.now() - started });
          await page.screenshot({
            path: join(screenshots, `${locale}-${device}-${route.replace(/\//g, '-')}.png`),
            fullPage: true,
          });
        });
      }
      for (const section of ['products', 'orders', 'agent/inbox']) {
        await page.goto(`/${locale}/admin/${section}`);
        await expect(page.locator('.admin-table')).toHaveAttribute('aria-busy', 'false');
        const record = page.getByRole('button', { name: /Mở bản ghi|Open record/ }).first();
        if (section === 'agent/inbox' && (await record.count()) === 0) {
          test
            .info()
            .annotations.push({ type: 'fixture', description: 'No pending agent thread available for detail review' });
          continue;
        }
        await record.click();
        await expect(page.locator('.admin-page h1').first()).toBeVisible();
        expect
          .soft(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
            `${section}: detail overflow`,
          )
          .toBe(true);
        await page.screenshot({
          path: join(screenshots, `${locale}-${device}-${section.replace('/', '-')}-detail.png`),
          fullPage: true,
        });
      }
      expect(failures).toEqual([]);
      await writeFile(join(screenshots, `${locale}-${device}-timings.json`), JSON.stringify(timings, null, 2));
      await test
        .info()
        .attach('navigation-times', { body: JSON.stringify(timings, null, 2), contentType: 'application/json' });
    });
  }
}

test('command search, modal focus, persistent Copilot draft and locale switching', async ({ page }) => {
  test.skip(!hasAdmin, 'Requires an existing synthetic admin account');
  await signIn(page, admin, '/admin/products');
  await page.waitForURL('**/admin/products');
  await page.getByRole('button', { name: 'Tìm nhanh trang', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const search = dialog.getByRole('searchbox', { name: 'Tìm nhanh trang' });
  await search.fill('don hang');
  await expect(search).toBeFocused();
  await dialog
    .getByRole('link', { name: /Đơn hàng/, exact: false })
    .first()
    .click();
  await page.waitForURL('**/admin/orders');
  await expect(dialog).not.toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(search).toBeFocused();
  await search.fill('no-such-page-9382');
  await expect(dialog.getByRole('status')).toHaveText('0 trang');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();

  await page.getByRole('button', { name: 'Mở trợ lý AI Copilot' }).click();
  await expect(dialog.getByText('Đang làm việc tại: Đơn hàng', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Doanh thu tháng này thế nào?' }).click();
  const draft = dialog.getByRole('textbox', { name: 'Nhập câu hỏi hoặc mô tả công việc…' });
  await expect(draft).toHaveValue('Doanh thu tháng này thế nào?');
  await expect(draft).toBeFocused();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Tìm nhanh trang', exact: true }).click();
  await dialog.getByRole('searchbox').fill('nhà cung cấp');
  await dialog.getByRole('link', { name: /Nhà cung cấp/ }).click();
  await page.waitForURL('**/admin/suppliers');
  await page.getByRole('button', { name: 'Mở trợ lý AI Copilot' }).click();
  await expect(draft).toHaveValue('Doanh thu tháng này thế nào?');
  await expect(dialog.getByText('Đang làm việc tại: Nhà cung cấp', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Switch to English' }).click();
  await page.waitForURL('**/en/admin/suppliers');
  await page.getByRole('button', { name: 'Open AI Copilot' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(dialog.getByText('Working in: Suppliers', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'How is revenue this month?' }).click();
  await expect(dialog.getByRole('textbox', { name: 'Ask a question or describe a task…' })).toHaveValue(
    'How is revenue this month?',
  );
});

for (const locale of ['vi', 'en'])
  test(`${locale}: mobile Copilot dialog remains usable and restores focus`, async ({ page }) => {
    test.skip(!hasAdmin, 'Requires an existing synthetic admin account');
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, admin, '/admin/dashboard');
    await page.waitForURL('**/admin/dashboard');
    await page.goto(`/${locale}/admin/products`);
    const launcher = page.locator('.admin-assistant-launcher');
    await launcher.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('textbox')).toBeVisible();
    await dialog.getByRole('textbox').fill('Synthetic unsent draft');
    await expect(dialog.getByRole('textbox')).toBeFocused();
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog')).toHaveCount(1);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: join(screenshots, `${locale}-mobile-copilot-dialog.png`), fullPage: true });
    await page.keyboard.press('Escape');
    await expect(launcher).toBeFocused();
    await launcher.click();
    await expect(dialog.getByRole('textbox')).toHaveValue('Synthetic unsent draft');
  });

test('mobile navigation traps focus, closes on selection and restores page interaction', async ({ page }) => {
  test.skip(!hasAdmin, 'Requires an existing synthetic admin account');
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, admin, '/admin/dashboard');
  await page.waitForURL('**/admin/dashboard');
  const toggle = page.locator('.admin-menu-trigger');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.admin-workspace-body')).toHaveAttribute('inert', '');
  const sidebar = page.locator('#sidebar');
  await expect(sidebar.getByRole('link', { name: 'Model Universe' })).toBeFocused();
  await page.keyboard.press('Control+k');
  await expect(page.locator('.admin-command')).toHaveCount(0);
  await page.keyboard.press('Shift+Tab');
  await expect(sidebar.getByRole('link', { name: 'Mở cửa hàng' })).toBeFocused();
  await sidebar.getByRole('button', { name: 'Mô hình và tồn kho', exact: true }).click();
  await sidebar.getByRole('link', { name: 'Danh mục mô hình', exact: true }).click();
  await page.waitForURL('**/admin/products');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.admin-workspace-body')).not.toHaveAttribute('inert', '');
  await expect(sidebar).not.toBeVisible();
  await toggle.click();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
});

test('catalog search, sorting, product details and order details remain interactive', async ({ page }) => {
  test.skip(!hasAdmin, 'Requires an existing synthetic admin account');
  await signIn(page, admin, '/admin/products');
  await page.waitForURL('**/admin/products');
  const table = page.locator('.admin-table');
  await expect(table).toHaveAttribute('aria-busy', 'false');
  await table.getByRole('button', { name: /^ID/ }).click();
  await expect(table.locator('th', { hasText: 'ID' })).toHaveAttribute('aria-sort', 'ascending');
  const search = table.getByRole('textbox');
  await search.fill('no-such-model-9382');
  await expect(table.getByText('Không tìm thấy sản phẩm', { exact: true })).toBeVisible();
  await search.fill('');
  await expect(table.getByRole('button', { name: /Mở bản ghi/ }).first()).toBeVisible();
  await table
    .getByRole('button', { name: /Mở bản ghi/ })
    .first()
    .click();
  await page.waitForURL(/\/admin\/products\/\d+$/);
  await expect(page.locator('main h1')).toBeVisible();
  await page.screenshot({ path: join(screenshots, 'vi-desktop-product-detail.png'), fullPage: true });
  await page.goto('/vi/admin/orders');
  await expect(page.locator('.admin-table')).toHaveAttribute('aria-busy', 'false');
  await page
    .getByRole('button', { name: /Mở bản ghi/ })
    .first()
    .click();
  await page.waitForURL(/\/admin\/orders\/\d+$/);
  await expect(page.locator('main h1')).toBeVisible();
  const orderId = new URL(page.url()).pathname.split('/').pop();
  await page.getByRole('button', { name: 'Mở trợ lý AI Copilot' }).click();
  await expect(
    page.getByRole('dialog').getByText(`Đang làm việc tại: Đơn hàng #${orderId}`, { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: join(screenshots, 'vi-desktop-order-detail.png'), fullPage: true });
});

test('alternate themes and reduced motion work on desktop and mobile', async ({ page }) => {
  test.skip(!hasAdmin, 'Requires an existing synthetic admin account');
  await signIn(page, admin, '/admin/dashboard');
  await page.waitForURL('**/admin/dashboard');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const device of ['desktop', 'mobile']) {
    await page.setViewportSize(device === 'desktop' ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
    await page.evaluate(
      (theme) => localStorage.setItem('color-theme', JSON.stringify(theme)),
      device === 'desktop' ? 'dark' : 'light',
    );
    for (const section of ['dashboard', 'products', 'marketing', 'agent/copilot', 'agent/settings']) {
      await page.goto(`/en/admin/${section}`);
      await expect(page.locator('.admin-page h1').first()).toBeVisible();
      await expect(page.locator('.admin-table[aria-busy="true"]')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect(
        await page.locator('.admin-search-trigger').evaluate((element) => getComputedStyle(element).transitionDuration),
      ).toBe('0s');
      await page.screenshot({
        path: join(screenshots, `${device}-alternate-${section.replace('/', '-')}.png`),
        fullPage: true,
      });
    }
  }
});

for (const width of [1440, 390]) {
  test(`${width}: management dialogs validate input and cancel without writes`, async ({ page }) => {
    test.skip(!hasAdmin, 'Requires an existing synthetic admin account');
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await signIn(page, admin, '/admin/categories');
    await page.waitForURL('**/admin/categories');
    const writes: string[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      // The existing approval badge polls a read-only search using LangGraph's POST endpoint.
      if (request.method() === 'POST' && path === '/api/admin/agent/server/threads/search') return;
      if (path.startsWith('/api/') && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method())) {
        writes.push(`${request.method()} ${path}`);
      }
    });
    await page.getByRole('button', { name: '+ Thêm danh mục', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const name = dialog.getByRole('textbox', { name: 'Tên danh mục', exact: true });
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toHaveAccessibleDescription('Vui lòng nhập tên danh mục.');
    await name.fill('Synthetic unsaved category');
    await expect(name).toBeFocused();
    await dialog.getByRole('button', { name: 'Huỷ', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole('button', { name: 'Sửa', exact: true }).first().click();
    await expect(name).not.toHaveValue('');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Xoá', exact: true }).first().click();
    await expect(dialog).toContainText('Bạn có chắc muốn xoá');
    await dialog.getByRole('button', { name: /^(Huỷ|Hủy)$/ }).click();

    for (const [route, trigger] of [
      ['suppliers', '+ Thêm nhà cung cấp'],
      ['coupons', '+ Thêm khuyến mãi'],
    ]) {
      await page.goto(`/vi/admin/${route}`);
      await page.getByRole('button', { name: trigger, exact: true }).click();
      await expect(dialog.getByRole('textbox').first()).toBeVisible();
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await dialog.getByRole('textbox').first().fill('Synthetic unsaved draft');
      await expect(dialog.getByRole('textbox').first()).toBeFocused();
      await page.screenshot({ path: join(screenshots, `vi-${width}-${route}-editor.png`), fullPage: true });
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
    }
    expect(writes).toEqual([]);
  });
}
