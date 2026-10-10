import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { admin, hasAdmin } from './helpers';

const artifacts = resolve(__dirname, '../../../.artifacts/model-universe/branded-scrollbar');
for (const locale of ['vi', 'en']) {
  test(`${locale}: floating rail auto-hides, reveals, drags and supports keyboard`, async ({ page }) => {
    await page.goto(`/${locale}/shop`);
    const rail = page.getByRole('scrollbar');
    const thumb = rail.locator('.mu-floating-scrollbar-thumb');
    await expect(rail).toBeVisible();
    await page.mouse.move(400, 100);
    await expect.poll(() => thumb.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(0);
    const bounds = (await rail.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 20);
    await expect.poll(() => thumb.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1);
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: resolve(artifacts, `${locale}-hover.png`) });
    const handle = (await thumb.boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 160, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(150);
    await rail.click({ position: { x: 9, y: bounds.height - 12 } });
    await expect(rail).toHaveAttribute('aria-valuenow', '100');
    await rail.press('End');
    await expect(rail).toHaveAttribute('aria-valuenow', '100');
    await rail.press('Home');
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await rail.evaluate((el) => (el as HTMLElement).blur());
    await page.mouse.move(400, 100);
    await expect.poll(() => thumb.evaluate((el) => Number(getComputedStyle(el).opacity)), { timeout: 5000 }).toBe(0);
    await page.mouse.wheel(0, 350);
    await expect.poll(() => thumb.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await thumb.evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThan(0.001);
    await page.evaluate(() => (document.body.style.overflow = 'hidden'));
    await expect(rail).not.toBeVisible();
    await page.evaluate(() => (document.body.style.overflow = ''));
    await expect(rail).toBeVisible();
    expect((await thumb.boundingBox())!.height).toBeGreaterThan(0);
    await page.emulateMedia({ forcedColors: 'active' });
    await expect(rail).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.classList.contains('has-floating-scrollbar'))).toBe(
      false,
    );
  });
}
test('touch devices retain native scrolling and no overlay', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto('http://localhost:6050/vi/shop');
  await expect(page.locator('.mu-floating-scrollbar')).toBeHidden();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarWidth)).toBe('thin');
  await page.evaluate(() => scrollTo({ top: 300, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await context.close();
});
test('admin dark workspace and nested sidebar retain independent scrolling', async ({ page }) => {
  test.skip(!hasAdmin, 'Requires synthetic administrator');
  expect((await page.request.post('/api/auth/login', { data: admin })).ok()).toBe(true);
  await page.setViewportSize({ width: 1440, height: 650 });
  await page.goto('/en/admin/marketing');
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  const sidebar = page.locator('.admin-sidebar-scroll');
  await sidebar.hover();
  const position = (await sidebar.boundingBox())!;
  await page.mouse.move(position.x + 80, position.y + 100);
  await page.mouse.wheel(0, 350);
  await expect.poll(() => sidebar.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.mouse.move(1400, 110);
  await expect
    .poll(() => sidebar.evaluate((el) => getComputedStyle(el).scrollbarColor), { timeout: 5000 })
    .toBe('rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)');
  const rail = page.getByRole('scrollbar');
  await rail.hover();
  await expect
    .poll(() => rail.locator('.mu-floating-scrollbar-thumb').evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBe(1);
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: resolve(artifacts, 'admin-dark.png') });
});
