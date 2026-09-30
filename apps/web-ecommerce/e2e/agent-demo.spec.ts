import { expect, test, type Page } from '@playwright/test';
import { admin, hasAdmin, signIn, writesEnabled } from './helpers';

// The demo (docs/DEMO.md) as a test, on the e2e stack: seeded shop, Agent Server with the scripted model,
// DEMO_MEASURE_AFTER_MINUTES=1. It writes to the shop (a discount, a task): run it against a throwaway database.
test.describe.configure({ mode: 'serial', timeout: 5 * 60_000 });

const DEAD_STOCK = 'Hàng tồn lâu';
const HIGH_RETURNS = 'Tỷ lệ đổi trả cao';

const openProposal = async (page: Page, title: string) => {
  await page.goto('/admin/agent/inbox');
  await page.locator('table tbody tr', { hasText: title }).first().click();
  await page.waitForURL('**/admin/agent/threads/**');
};

test.describe('@demo the loop through the agent console', () => {
  test.skip(!hasAdmin || !writesEnabled, 'set E2E_ADMIN_EMAIL/PASSWORD and E2E_ALLOW_WRITES=1 (writes to the shop)');

  test.beforeEach(async ({ page }) => {
    await signIn(page, admin, '/admin/agent/inbox');
    await page.waitForURL('**/admin/agent/inbox');
  });

  test('a detection run yields two proposals, the dead-stock one citing SOP-001', async ({ page }) => {
    await page.getByRole('button', { name: 'Chạy phát hiện ngay' }).click();
    await expect(page.getByRole('button', { name: 'Chạy phát hiện ngay' })).toBeEnabled({ timeout: 90_000 });
    await expect(page.locator('table tbody tr', { hasText: DEAD_STOCK }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('table tbody tr', { hasText: HIGH_RETURNS }).first()).toBeVisible();

    await openProposal(page, DEAD_STOCK);
    await expect(page.getByRole('heading', { name: 'Phân tích' })).toBeVisible();
    await expect(page.getByText('SOP-001').first()).toBeVisible();
    // Estimates are computed by the agent's code, in VND (formatVND: non-breaking space before ₫).
    await expect(page.getByText(/Thu hồi ước tính [\d.]+\s₫/).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cần bạn quyết định' })).toBeVisible();
  });

  test('approving the discount at 25% applies it to the shop and starts measuring', async ({ page }) => {
    await openProposal(page, DEAD_STOCK);
    const panel = page.locator('section', { hasText: 'Cần bạn quyết định' });
    await panel.getByLabel('Mức giảm (%)').fill('25');
    await panel.getByRole('button', { name: 'Duyệt phương án đã chọn' }).click();
    await expect(page.getByRole('dialog')).toContainText('Mức giảm (%) 20 → 25');
    await page.getByRole('dialog').getByRole('button', { name: 'Duyệt' }).click();

    await expect(page.getByText('Đang đo lường').first()).toBeVisible({ timeout: 60_000 });
    const executed = page.locator('section', { hasText: 'Thao tác đã thực hiện' });
    await expect(executed).toContainText('Giảm 25% trong');
    await expect(executed).toContainText('[thành công]');

    // The storefront shows the sale price of a discounted SKU.
    const skus = (await executed.locator('li').first().locator('span.break-all').innerText()).split(',');
    await page.goto(`/search?q=${encodeURIComponent(skus[0].trim())}`);
    await expect(page.getByText('-25%').first()).toBeVisible({ timeout: 30_000 });

    await page.goto('/admin/agent/tasks');
    await expect(page.getByText('Ưu tiên hiển thị các mã đang giảm giá').first()).toBeVisible();
  });

  test('rejecting the returns proposal with a note closes it', async ({ page }) => {
    await openProposal(page, HIGH_RETURNS);
    const panel = page.locator('section', { hasText: 'Cần bạn quyết định' });
    await panel.getByPlaceholder(/Ghi chú/).fill('Nhà cung cấp in sai bảng size; sẽ đổi nhà cung cấp.');
    await panel.getByRole('button', { name: 'Từ chối' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Từ chối' }).click();
    await expect(page.getByText('Bị từ chối').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Đã đóng').first()).toBeVisible();
  });

  test('after the demo wait, a run measures and learns; Impact shows the result', async ({ page }) => {
    // DEMO_MEASURE_AFTER_MINUTES=1 on the e2e stack: the follow-up is due a minute after the approval.
    await page.waitForTimeout(65_000);
    await page.getByRole('button', { name: 'Chạy phát hiện ngay' }).click();
    await expect(page.getByRole('button', { name: 'Chạy phát hiện ngay' })).toBeEnabled({ timeout: 90_000 });
    await expect(async () => {
      await page.goto('/admin/agent/impact');
      await expect(page.locator('table tbody tr', { hasText: DEAD_STOCK }).first()).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 120_000 });
    await page.locator('table tbody tr', { hasText: DEAD_STOCK }).first().getByRole('link').click();
    await expect(page.getByRole('heading', { name: 'Kết quả đo lường' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bài học' })).toBeVisible();
  });
});
