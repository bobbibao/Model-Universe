import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import en from '../src/messages/en.json';
import vi from '../src/messages/vi.json';
import { admin, customer, hasAdmin, hasCustomer, fillCollectibleIntake } from './helpers';

const artifacts = resolve(__dirname, '../../../.artifacts/model-universe/collector-studio');
async function capture(page: Page, name: string) {
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator('img').evaluateAll((images) => images.forEach((image) => image.setAttribute('loading', 'eager')));
  await page.waitForFunction(() =>
    Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0),
  );
  await page.evaluate(() => document.fonts.ready);
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: resolve(artifacts, `${name}.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

for (const locale of ['en', 'vi']) {
  const messages = locale === 'en' ? en : vi;
  for (const device of ['desktop', 'mobile']) {
    test(`${locale} ${device}: service discovery, terms, filters and photo controls`, async ({ page, request }) => {
      test.setTimeout(180_000);
      await page.setViewportSize(device === 'desktop' ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      for (const route of [
        'services',
        'services/sell',
        'services/pawn',
        'services/reserve',
        'services/loyalty',
        'services/partner',
        'kit-finder',
        'about',
        'contact',
        'compare',
        'cart',
      ]) {
        const response = await page.goto(`/${locale}/${route}`);
        expect(response?.status(), route).toBe(200);
        await expect(page.locator('main h1').first()).toBeVisible();
        if (route === 'about' || route === 'contact') await expect(page).toHaveTitle(messages.metadata[route]);
        if (route.startsWith('services')) {
          const terms = page.locator('.service-terms');
          await expect(terms).not.toHaveAttribute('open', '');
          await terms.locator('summary').click();
          await expect(terms.locator('.service-terms-content')).toBeVisible();
          await terms.locator('summary').click();
        }
        await capture(page, `${locale}-${device}-${route.replaceAll('/', '-')}`);
      }
      await page.goto(`/${locale}/shop`);
      const more = page.locator('.studio-filter-more');
      await more.locator('summary').click();
      await page.locator('#filter-scale').selectOption('1/144');
      await page.getByRole('button', { name: messages.catalog.apply, exact: true }).click();
      await expect(page).toHaveURL(/scale=1%2F144|scale=1\/144/);
      await expect(page.locator('#filter-scale')).toHaveValue('1/144');
      await page.getByRole('button', { name: messages.catalog.reset, exact: true }).click();
      await expect(page.locator('#filter-scale')).toHaveValue('');
      const payload = await (await request.get('/api/products?per_page=100')).json();
      const product =
        payload.payload.data.find(
          (item: { images?: unknown[]; imageUrls?: unknown[] }) => (item.images || item.imageUrls || []).length > 1,
        ) || payload.payload.data[0];
      await page.goto(`/${locale}/shop/product/${product.id}`);
      const depth = page.locator('.studio-gallery-toolbar button:visible');
      await expect(depth).toHaveAttribute('aria-pressed', 'true');
      await depth.click();
      await expect(page.locator('.studio-detail-stage:visible')).not.toHaveClass(/has-depth/);
      await depth.click();
      const next = page.getByRole('button', { name: messages.experience.nextPhoto, exact: true });
      if (await next.count()) {
        const photo = page.locator('.studio-detail-stage:visible img');
        const first = await photo.getAttribute('src');
        await next.click();
        await expect(photo).not.toHaveAttribute('src', first!);
        await page.getByRole('button', { name: messages.experience.previousPhoto, exact: true }).click();
        await expect(photo).toHaveAttribute('src', first!);
      }
      await capture(page, `${locale}-${device}-gallery`);
      expect(errors).toEqual([]);
    });

    test(`${locale} ${device}: intake validates steps and retains entered values without writes`, async ({ page }) => {
      test.skip(!hasCustomer, 'Requires the existing synthetic customer account');
      await page.setViewportSize(device === 'desktop' ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
      expect((await page.request.post('/api/auth/login', { data: customer })).ok()).toBe(true);
      const writes: string[] = [];
      page.on('request', (request) => {
        if (request.url().includes('/api/') && request.method() !== 'GET') writes.push(request.url());
      });
      for (const service of ['sell', 'pawn']) {
        await page.goto(`/${locale}/services/${service}`);
        await page
          .getByRole('button', {
            name: service === 'sell' ? messages.buyback.newRequest : messages.pawn.newRequest,
            exact: true,
          })
          .click();
        await page.getByRole('button', { name: messages.experience.continue, exact: true }).click();
        await expect(page.locator('[data-intake-step="0"]')).toBeVisible();
        await expect(page.locator('input[name="name"]')).toBeFocused();
        await fillCollectibleIntake(page, messages, {
          name: 'Unsaved inspection',
          modelCode: 'UI-ONLY',
          version: 'Original',
          boxCondition: 'Original box',
          accessories: 'All parts',
          defects: 'None reported',
          repairHistory: 'None reported',
        });
        await expect(page.locator('[data-intake-step="2"]')).toBeVisible();
        await expect(page.getByRole('button', { name: messages.common.submit, exact: true })).toBeDisabled();
        await page.getByRole('button', { name: messages.experience.back, exact: true }).click();
        await expect(page.locator('textarea[name="defects"]')).toHaveValue('None reported');
        await page.getByRole('button', { name: messages.experience.back, exact: true }).click();
        await expect(page.locator('input[name="name"]')).toHaveValue('Unsaved inspection');
        await capture(page, `${locale}-${device}-${service}-intake`);
      }
      expect(writes).toEqual([]);
    });
  }
}

test('photo depth honors pointer capability, reduced motion and flat mode', async ({ page, request, browser }) => {
  const product = (await (await request.get('/api/products?per_page=1')).json()).payload.data[0];
  const route = `/en/shop/product/${product.id}`;
  await page.goto(route);
  const stage = page.locator('.studio-detail-stage:visible');
  const tilt = async () => {
    const box = await stage.boundingBox();
    await page.mouse.move(box!.x + box!.width * 0.85, box!.y + box!.height * 0.25);
  };
  await tilt();
  await expect.poll(() => stage.evaluate((element) => element.style.getPropertyValue('--stage-y'))).not.toBe('0deg');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await tilt();
  await expect.poll(() => stage.evaluate((element) => element.style.getPropertyValue('--stage-y'))).toBe('0deg');
  const touch = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:6050',
    isMobile: true,
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  const mobile = await touch.newPage();
  await mobile.goto(route);
  await mobile.locator('.studio-detail-stage:visible').tap();
  expect(
    await mobile
      .locator('.studio-detail-stage:visible')
      .evaluate((element) => element.style.getPropertyValue('--stage-y')),
  ).toBe('0deg');
  await touch.close();
});

test('admin operation selector retains drafts in independent financial forms', async ({ page }) => {
  test.skip(!hasAdmin, 'Requires the existing synthetic admin');
  expect((await page.request.post('/api/auth/login', { data: admin })).ok()).toBe(true);
  const writes: string[] = [];
  page.on('request', (request) => {
    if (
      request.url().includes('/api/') &&
      request.method() !== 'GET' &&
      new URL(request.url()).pathname !== '/api/admin/agent/server/threads/search'
    )
      writes.push(request.url());
  });
  await page.goto('/en/admin/loyalty');
  const panels = page.locator('.studio-operation-panels');
  await panels.getByLabel(en.loyalty.productId, { exact: true }).fill('123');
  await panels.getByRole('button', { name: en.loyalty.refund, exact: true }).click();
  await panels.getByLabel(en.loyalty.orderId, { exact: true }).fill('456');
  await panels.getByRole('button', { name: en.loyalty.adjust, exact: true }).click();
  await panels.getByLabel(en.loyalty.pointsDelta, { exact: true }).fill('42');
  await panels.getByRole('button', { name: en.loyalty.createGift, exact: true }).click();
  await expect(panels.getByLabel(en.loyalty.productId, { exact: true })).toHaveValue('123');
  await panels.getByRole('button', { name: en.loyalty.refund, exact: true }).click();
  await expect(panels.getByLabel(en.loyalty.orderId, { exact: true })).toHaveValue('456');
  await capture(page, 'en-desktop-admin-operation-panels');
  expect(writes).toEqual([]);
});

test('tablet menu, language refresh and localized contact validation', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/') && request.method() !== 'GET') writes.push(request.url());
  });
  for (const width of [640, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/en/services');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (width < 1280) {
      const toggle = page.locator('.mu-actions button[aria-controls="store-mobile-menu"]');
      await toggle.click();
      await expect(page.locator('#store-mobile-menu')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(toggle).toBeFocused();
      await expect(page.locator('#store-mobile-menu')).toHaveCount(0);
    }
  }
  await page.goto('/en/contact');
  await page.getByRole('button', { name: en.studioContent.send, exact: true }).click();
  await expect(page.getByText(en.studioContent.nameError, { exact: true })).toBeVisible();
  await expect(page.getByText(en.studioContent.emailError, { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Chuyển sang tiếng Việt', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(page.getByRole('heading', { name: vi.studioContent.contactTitle, exact: true })).toBeVisible();
  await page.getByRole('button', { name: vi.studioContent.send, exact: true }).click();
  await expect(page.getByText(vi.studioContent.nameError, { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});
