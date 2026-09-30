import { expect, test } from '@playwright/test';
import { admin, customer, hasAdmin, hasCustomer, signIn } from './helpers';

// Fast checks: no LLM call, no write to the shop.

test('an unauthenticated visit to the CI console goes to sign-in', async ({ page }) => {
  await page.goto('/admin/ci/improvements');
  await expect(page).toHaveURL(/\/auth\/signin\?redirect=%2Fadmin%2Fci%2Fimprovements/);
});

test('a wrong password shows an error and stays on sign-in', async ({ page }) => {
  test.skip(!hasAdmin, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set');
  await signIn(page, { email: admin.email, password: `${admin.password}-wrong` });
  await expect(page.getByText('Email hoặc mật khẩu không chính xác.')).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/signin/);
});

test('a customer has no access to the CI console or its API', async ({ page }) => {
  test.skip(!hasCustomer, 'E2E_CUSTOMER_EMAIL / E2E_CUSTOMER_PASSWORD not set');
  await signIn(page, customer);
  await page.waitForURL('**/');
  await page.goto('/admin/ci/improvements');
  await expect(page).not.toHaveURL(/\/admin\/ci/);
  for (const path of ['/api/admin/ci/improvements', '/api/admin/ci/runs/status', '/api/admin/ci/tasks']) {
    expect((await page.request.get(path)).status(), path).toBe(403);
  }
});

test.describe('as an admin', () => {
  test.skip(!hasAdmin, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set');

  test.beforeEach(async ({ page }) => {
    await signIn(page, admin, '/admin/ci/improvements');
    await page.waitForURL('**/admin/ci/improvements');
  });

  test('the sidebar has the CẢI TIẾN (AI) group and /admin/ci opens the inbox', async ({ page }) => {
    const group = page.getByRole('heading', { name: 'CẢI TIẾN (AI)' }).locator('..');
    for (const name of ['Đề xuất cải tiến', 'Công việc từ AI', 'Hiệu quả cải tiến', 'Thư viện tình huống']) {
      await expect(group.getByRole('link', { name })).toBeVisible();
    }
    await page.goto('/admin/ci');
    await expect(page).toHaveURL(/\/admin\/ci\/improvements$/);
    await expect(page.getByRole('button', { name: 'Chạy phát hiện ngay' })).toBeVisible();
    await expect(page.getByText(/Chạy tự động:/)).toBeVisible();
  });

  test('every CI page loads in Vietnamese without a console error', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const pages: Record<string, string> = {
      '/admin/ci/improvements': 'Đề xuất cải tiến',
      '/admin/ci/tasks': 'Công việc từ AI',
      '/admin/ci/impact': 'Hiệu quả cải tiến',
      '/admin/ci/cases': 'Thư viện tình huống',
    };
    for (const [path, heading] of Object.entries(pages)) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading, level: 2 })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  // Regression: Satoshi has no glyphs for ạ..ỹ, ơ, ư; the fallback faces in src/css/satoshi.css must cover them.
  test('Vietnamese letters with two marks use the fallback face', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Đề xuất cải tiến', level: 2 })).toBeVisible();
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready;
      const faces: string[] = [];
      document.fonts.forEach((face) => {
        const family = face.family.replace(/"/g, '');
        if (family === 'Satoshi' && face.unicodeRange.includes('1EA0') && face.status === 'loaded') {
          faces.push(`${face.weight} ${face.style}`);
        }
      });
      return faces;
    });
    expect(loaded.length).toBeGreaterThan(0);
  });

  // Regressions: the dark body background, and no sideways page scroll on a phone.
  test('dark mode colours the whole page and phones do not scroll sideways', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('color-theme', JSON.stringify('dark')));
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/admin/ci/improvements', '/admin/ci/tasks', '/admin/ci/impact', '/admin/ci/cases']) {
      await page.goto(path);
      await expect(page.locator('main table').first()).toBeVisible();
      const layout = await page.evaluate(() => ({
        dark: document.body.classList.contains('dark'),
        bodyBg: getComputedStyle(document.body).backgroundColor,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      expect(layout.dark, path).toBe(true);
      expect(layout.bodyBg, path).not.toBe('rgb(241, 245, 249)');
      expect(layout.overflow, path).toBeLessThanOrEqual(1);
    }
  });

  test('an unknown proposal id says "not found"', async ({ page }) => {
    await page.goto('/admin/ci/improvements/00000000-0000-0000-0000-000000000000');
    // Scoped to the page: the error toast repeats the same text.
    await expect(page.locator('main').getByText('Không tìm thấy đề xuất cải tiến.')).toBeVisible();
  });
});
