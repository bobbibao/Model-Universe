import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import en from '../src/messages/en.json';
import vi from '../src/messages/vi.json';
import { customer, hasCustomer } from './helpers';

for (const locale of ['en', 'vi']) {
  const messages = locale === 'en' ? en : vi;
  for (const width of [1440, 390]) {
    test(`${locale} ${width}: original morph, navigation and real session logout`, async ({ page }) => {
      test.skip(!hasCustomer, 'Requires the retained synthetic customer account');
      await page.setViewportSize({ width, height: 900 });
      expect((await page.request.post('/api/auth/login', { data: customer })).ok()).toBe(true);
      await page.goto(`/${locale}`);
      const art = page.locator('.studio-showcase:visible .mu-hero-art');
      await expect(art.getByRole('img', { name: messages.nav.heroArtwork })).toBeVisible();
      await expect(page.locator('.studio-showcase .product-stage-photo')).toHaveCount(0);
      const visor = art.locator('[data-morph-visor]');
      const original = await visor.getAttribute('d');
      const activate = art.getByRole('button', { name: messages.nav.activateMorph });
      const controlBox = await activate.boundingBox();
      const calloutBox = await page.locator('.studio-showcase-info:visible').boundingBox();
      expect(controlBox!.height).toBeGreaterThanOrEqual(44);
      expect(controlBox!.y + controlBox!.height).toBeLessThanOrEqual(calloutBox!.y);
      await activate.focus();
      await activate.press('Enter');
      await expect(visor).not.toHaveAttribute('d', original!);
      await page.waitForTimeout(1200);
      const settled = await visor.getAttribute('d');
      await page.waitForTimeout(300);
      await expect(visor).toHaveAttribute('d', settled!);
      const folder = resolve(__dirname, '../../../.artifacts/model-universe/hero-session');
      await mkdir(folder, { recursive: true });
      await page.screenshot({ path: resolve(folder, `${locale}-${width}.png`) });
      if (width === 390) await page.locator('button[aria-controls="store-mobile-menu"]').click();
      await expect(page.locator('header').getByRole('link', { name: messages.nav.arrivals, exact: true })).toHaveCount(0);
      await expect(page.locator('header').getByRole('link', { name: messages.nav.shop, exact: true })).toBeVisible();
      const logout = page.locator('header').getByRole('button', { name: messages.nav.logout, exact: true });
      await expect(logout).toBeVisible();
      const response = page.waitForResponse(r => r.url().endsWith('/api/auth/logout') && r.request().method() === 'POST');
      await logout.click();
      expect((await response).ok()).toBe(true);
      await expect(logout).toHaveCount(0);
      expect((await (await page.request.get('/api/auth/me')).json()).user).toBeNull();
      await expect(page).toHaveURL(new RegExp(`/${locale}/?$`));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    });
  }
}

test('reduced motion stays static and does not load MorphSVG on activation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en');
  const art = page.locator('.mu-hero-art:visible');
  const visor = art.locator('[data-morph-visor]');
  const original = await visor.getAttribute('d');
  await art.hover();
  await expect(art.getByRole('button')).toBeHidden();
  await page.waitForTimeout(800);
  await expect(visor).toHaveAttribute('d', original!);
});

test('touchscreen can activate the original artwork', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:6050',
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await page.goto('/en');
    const visor = page.locator('.mu-hero-art:visible [data-morph-visor]');
    const original = await visor.getAttribute('d');
    await page.getByRole('button', { name: en.nav.activateMorph }).tap();
    await expect(visor).not.toHaveAttribute('d', original!);
  } finally {
    await context.close();
  }
});

test('changing the motion preference cancels and resets an active morph', async ({ page }) => {
  await page.goto('/en');
  const art = page.locator('.mu-hero-art:visible');
  const visor = art.locator('[data-morph-visor]');
  const original = await visor.getAttribute('d');
  await art.getByRole('button', { name: en.nav.activateMorph }).click();
  await expect(visor).not.toHaveAttribute('d', original!);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(visor).toHaveAttribute('d', original!);
  await expect(art.getByRole('button')).toBeHidden();
});

test('failed sign out retains the session and offers a successful retry', async ({ page }) => {
  test.skip(!hasCustomer, 'Requires synthetic customer');
  expect((await page.request.post('/api/auth/login', { data: customer })).ok()).toBe(true);
  await page.goto('/en');
  await page.route('**/api/auth/logout', route => route.fulfill({ status: 503, json: {} }));
  const logout = page.locator('header').getByRole('button', { name: en.nav.logout, exact: true });
  await logout.click();
  await expect(page.getByRole('alert').filter({ hasText: en.nav.logoutFailed })).toBeVisible();
  await expect(logout).toBeEnabled();
  expect((await (await page.request.get('/api/auth/me')).json()).user).toBeTruthy();
  await page.unroute('**/api/auth/logout');
  await logout.click();
  await expect(logout).toHaveCount(0);
});

for (const reduced of [false, true]) {
  test(`contact success motion, reduced motion ${reduced}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    let animationLoads = 0;
    page.on('request', request => { if (request.url().endsWith('/animations/collection-complete.json')) animationLoads++; });
    // The success response is isolated; do not create a message in the retained database.
    await page.route('**/api/contact', route => route.fulfill({ status: 200, json: { success: true } }));
    await page.goto('/en/contact');
    await page.getByLabel(en.studioContent.name, { exact: true }).fill('Browser fixture');
    await page.getByLabel('Email', { exact: true }).fill('fixture@example.test');
    await page.getByLabel(en.studioContent.message, { exact: true }).fill('A synthetic message to verify success feedback.');
    expect(animationLoads).toBe(0);
    await page.getByRole('button', { name: en.studioContent.send, exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: en.studioContent.thanks })).toBeVisible();
    if (reduced) {
      await page.waitForTimeout(300);
      expect(animationLoads).toBe(0);
    } else {
      await expect.poll(() => animationLoads).toBe(1);
      await expect(page.locator('.studio-contact [aria-hidden="true"] .absolute svg')).toBeVisible();
    }
    await page.getByRole('button', { name: en.studioContent.sendAnother }).click();
    await expect(page.getByLabel(en.studioContent.message, { exact: true })).toHaveValue('');
  });
}
