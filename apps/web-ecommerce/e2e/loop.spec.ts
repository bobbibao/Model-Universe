import { expect, test } from '@playwright/test';
import { admin, hasAdmin, llmEnabled, signIn, statusLine, waitForRun, writesEnabled } from './helpers';

// Slow: runs a detection (4 LLM calls of 15-40 s with qwen2.5:3b). Needs a fresh agent state (docs/DEMO.md section 5)
// so that the seeded signals are new. With E2E_ALLOW_WRITES=1 it also approves and rejects, which writes to the shop.
test.describe.configure({ timeout: 10 * 60_000 });

test.describe('the Detect -> Ask -> Act loop through the console', () => {
  test.skip(!hasAdmin || !llmEnabled, 'set E2E_LLM=1 and the admin account to run the slow loop');

  test.beforeEach(async ({ page }) => {
    await signIn(page, admin, '/admin/ci/improvements');
    await page.waitForURL('**/admin/ci/improvements');
  });

  test('a run shows live progress and yields two proposals with VND amounts', async ({ page }) => {
    // The scheduler's first run starts one interval after the agent starts; if it is already going, the button is
    // disabled and this test follows that run instead of starting one.
    const runButton = page.getByRole('button', { name: 'Chạy phát hiện ngay' });
    if (await runButton.isEnabled()) {
      await runButton.click();
      await expect(statusLine(page)).toContainText(/Đang chạy \((thủ công|tự động)\)|Lượt chạy gần nhất/);
    }
    await waitForRun(page);
    await expect(page.locator('table tbody tr', { hasText: 'Hàng tồn lâu' }).first()).toBeVisible();
    await expect(page.locator('table tbody tr', { hasText: 'Tỷ lệ trả hàng cao' }).first()).toBeVisible();

    await page.locator('table tbody tr', { hasText: 'Hàng tồn lâu' }).first().click();
    await expect(page.getByRole('heading', { name: 'Phân tích' })).toBeVisible();
    // Every cause carries a source badge: AI (the LLM answered) or quy tắc (the rules answered).
    const analysis = page.locator('section', { has: page.getByRole('heading', { name: 'Phân tích' }) });
    expect(await analysis.locator('span', { hasText: /^(AI|quy tắc)$/ }).count()).toBeGreaterThan(0);
    await expect(analysis.getByText(/SOP-00\d/).first()).toBeVisible();
    // formatVND separates the amount and ₫ with a non-breaking space.
    await expect(page.getByText(/Thu hồi ước tính [\d.]+\s₫/).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cần bạn quyết định' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Lịch sử' })).toBeVisible();
  });

  test('approving the discount with a changed rate acts through the shop and starts measuring', async ({ page }) => {
    test.skip(!writesEnabled, 'set E2E_ALLOW_WRITES=1 to approve (writes discounts and a task to the shop)');
    await page.getByRole('button', { name: 'Chờ duyệt', exact: true }).click();
    await page.locator('table tbody tr', { hasText: 'Hàng tồn lâu' }).first().click();
    const panel = page.locator('section', { hasText: 'Cần bạn quyết định' });
    await panel.getByLabel('Mức giảm (%)').fill('25');
    await panel.getByRole('button', { name: 'Duyệt phương án đã chọn' }).click();
    await expect(page.getByRole('dialog')).toContainText('Mức giảm (%) 20 → 25');
    await page.getByRole('dialog').getByRole('button', { name: 'Duyệt' }).click();
    await expect(page.locator('section').first()).toContainText('Đang đo lường', { timeout: 60_000 });
    await expect(page.getByText('Apply 25% discount').first()).toBeVisible();
    await page.goto('/admin/ci/tasks');
    await expect(page.getByText('Give discounted SKUs prominent placement').first()).toBeVisible();
  });

  test('rejecting the returns proposal with a note closes it and stores a case', async ({ page }) => {
    test.skip(!writesEnabled, 'set E2E_ALLOW_WRITES=1 to reject (stores a case)');
    await page.getByRole('button', { name: 'Chờ duyệt', exact: true }).click();
    await page.locator('table tbody tr', { hasText: 'Tỷ lệ trả hàng cao' }).first().click();
    const panel = page.locator('section', { hasText: 'Cần bạn quyết định' });
    await panel.getByRole('button', { name: 'Yêu cầu phân tích thêm' }).click();
    await expect(panel.getByText('Vui lòng cho biết cần phân tích thêm điều gì.')).toBeVisible();
    await panel
      .getByPlaceholder(/Lý do từ chối/)
      .fill('The supplier prints a wrong size chart; we will switch supplier.');
    await panel.getByRole('button', { name: 'Từ chối' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Từ chối' }).click();
    await expect(page.locator('section').first()).toContainText('Đã đóng', { timeout: 3 * 60_000 });
    await page.goto('/admin/ci/cases');
    await expect(page.locator('table tbody tr', { hasText: 'Bị từ chối' }).first()).toBeVisible();
  });
});
