import { expect, test } from '@playwright/test';
import { admin, hasAdmin, signIn } from './helpers';

test('admin navigation preserves sidebar scroll and dropdowns', async ({ page }) => {
  test.skip(!hasAdmin, 'Requires E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD');
  await page.setViewportSize({ width: 1440, height: 600 });
  await signIn(page, admin, '/admin/agent/inbox');
  await page.waitForURL('**/admin/agent/inbox');
  const nav = page.getByRole('navigation', { name: 'Menu quản trị' });
  for (const name of ['Biểu đồ', 'Sản phẩm', 'Đơn hàng', 'Khách hàng & liên hệ', 'Tăng trưởng & hiệu quả', 'Tri thức & quản trị']) {
    const button = nav.getByRole('button', { name, exact: true });
    if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
  }

  const scroller = page.locator('#sidebar > div:last-child');
  await scroller.evaluate((element) => {
    element.setAttribute('data-navigation-check', 'mounted');
    element.scrollTop = element.scrollHeight;
  });
  const scrollTop = await scroller.evaluate((element) => element.scrollTop);
  expect(scrollTop).toBeGreaterThan(0);
  await nav.getByRole('link', { name: 'Nhật ký', exact: true }).click();
  await page.waitForURL('**/admin/agent/audit');
  await expect(page.getByRole('heading', { name: 'Nhật ký Agent', exact: true })).toBeVisible();
  await expect(scroller).toHaveAttribute('data-navigation-check', 'mounted');
  expect(await scroller.evaluate((element) => element.scrollTop)).toBe(scrollTop);

  await nav.getByRole('link', { name: 'Tri thức', exact: true }).click();
  await page.waitForURL('**/admin/agent/knowledge');
  await expect(page.getByRole('heading', { name: 'Tri thức của Agent', exact: true })).toBeVisible();
  await expect(scroller).toHaveAttribute('data-navigation-check', 'mounted');

  const group = nav.getByRole('button', { name: 'Tri thức & quản trị', exact: true });
  await group.click();
  await expect(group).toHaveAttribute('aria-expanded', 'false');
  await group.click();
  await page.reload();
  await expect(nav.getByRole('button', { name: 'Tăng trưởng & hiệu quả', exact: true })).toHaveAttribute('aria-expanded', 'true');
});
