import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import en from '../src/messages/en.json';
import vi from '../src/messages/vi.json';
import { customer, hasCustomer } from './helpers';

const artifacts = resolve(__dirname, '../../../.artifacts/model-universe/account-hub');
async function capture(page: Page, name: string) {
  await page.evaluate(() => scrollTo(0, 0));
  await page.evaluate(() => document.fonts.ready);
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: resolve(artifacts, `${name}.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

for (const locale of ['vi', 'en']) {
  const messages = locale === 'vi' ? vi : en;
  test(`${locale}: mobile account entry and language switch retain the real session`, async ({ page }) => {
    test.skip(!hasCustomer, 'Requires retained synthetic customer');
    await page.setViewportSize({ width: 390, height: 900 });
    expect((await page.request.post('/api/auth/login', { data: customer })).ok()).toBe(true);
    await page.goto(`/${locale}`);
    await page.locator('.mu-mobile-nav:visible').getByRole('link', { name: messages.nav.account, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: messages.accountHub.title })).toBeVisible();
    const other = locale === 'vi' ? 'en' : 'vi';
    await page
      .locator('.mu-header:visible')
      .getByRole('link', { name: locale === 'vi' ? 'Switch to English' : 'Chuyển sang tiếng Việt' })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${other}/user-profile`));
    await expect(
      page.getByRole('heading', { level: 1, name: (other === 'vi' ? vi : en).accountHub.title }),
    ).toBeVisible();
    await expect(page.locator('.account-session').getByRole('button')).toBeVisible();
  });
  for (const width of [1440, 390]) {
    test(`${locale} ${width}: unified account, member drafts, security and support`, async ({ page }) => {
      test.setTimeout(120_000);
      test.skip(!hasCustomer, 'Requires retained synthetic customer');
      await page.setViewportSize({ width, height: 1000 });
      expect((await page.request.post('/api/auth/login', { data: customer })).ok()).toBe(true);
      const errors: string[] = [];
      const writes: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        if (
          new URL(request.url()).pathname.startsWith('/api/') &&
          !['GET', 'HEAD'].includes(request.method()) &&
          !request.url().endsWith('/api/cart/quote')
        )
          writes.push(request.url());
      });
      await page.goto(`/${locale}/user-profile`);
      await expect(page.getByRole('heading', { level: 1, name: messages.accountHub.title })).toBeVisible();
      await expect(page.locator('.account-member-card h2')).not.toHaveText(messages.common.loading);
      await capture(page, `${locale}-${width}-overview`);
      const choose = async (key: string) => {
        await page.locator(`#account-nav-${key}:visible`).click();
        await expect(page).toHaveURL(new RegExp(`section=${key}`));
        await expect(page.locator(`#account-nav-${key}:visible`)).toHaveAttribute('aria-current', 'page');
      };
      await choose('membership');
      const reference = page.getByLabel(messages.loyalty.transactionReference, { exact: true });
      await reference.fill('UNSAVED-ACCOUNT-FIXTURE');
      await expect(page.locator('.account-membership .service-terms')).toBeVisible();
      await capture(page, `${locale}-${width}-membership`);
      await choose('account');
      await page
        .getByRole('button', {
          name: messages.profile.updateField.replace('{field}', messages.profile.firstName),
          exact: true,
        })
        .click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await page.getByRole('button', { name: messages.profile.changePassword, exact: true }).click();
      await dialog.getByRole('button', { name: messages.profile.update, exact: true }).click();
      await expect(dialog).toContainText(messages.profile.completeFields);
      await dialog.getByRole('button', { name: messages.profile.cancel, exact: true }).click();
      await capture(page, `${locale}-${width}-account`);
      await choose('membership');
      await expect(reference).toHaveValue('UNSAVED-ACCOUNT-FIXTURE');
      await choose('orders');
      await expect(page.getByRole('heading', { name: messages.checkout.historyTitle, exact: true })).toBeVisible();
      const pagination = page.getByRole('navigation', { name: messages.common.pagination, exact: true });
      if (await pagination.count()) {
        await expect(pagination.getByRole('button', { name: messages.common.next, exact: true })).toBeVisible();
        await pagination.getByRole('button', { name: messages.common.next, exact: true }).click();
        await expect(pagination.getByRole('button', { name: '2', exact: true })).toHaveAttribute(
          'aria-current',
          'page',
        );
      }
      await capture(page, `${locale}-${width}-orders`);
      await choose('addresses');
      const label = page.getByLabel(messages.customerTools.addressLabel, { exact: true });
      await label.fill('Unsaved address label');
      await choose('inbox');
      await expect(page.getByRole('heading', { name: messages.customerTools.inbox, exact: true })).toBeVisible();
      await capture(page, `${locale}-${width}-inbox`);
      await page.goBack();
      await expect(label).toHaveValue('Unsaved address label');
      await capture(page, `${locale}-${width}-addresses`);
      await choose('support');
      await page.locator('.account-help summary').first().click();
      await expect(page.locator('.account-help details').first()).toHaveAttribute('open', '');
      await capture(page, `${locale}-${width}-support`);
      await page.getByRole('button', { name: messages.accountHub.openAssistant, exact: true }).click();
      await expect(page.getByRole('dialog').locator('textarea')).toBeVisible();
      expect(writes).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

test('guest and invalid section links stay usable at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/en/user-profile?section=unknown');
  await expect(page).toHaveURL(/\/en\/auth\/signin\?redirect=/);
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
  await expect(page.locator('.account-sidebar')).toHaveCount(0);
  await capture(page, 'guest-320');
  if (hasCustomer) {
    expect((await page.request.post('/api/auth/login', { data: customer })).ok()).toBe(true);
    await page.goto('/en/user-profile?section=unknown');
    await expect(page.locator('#account-nav-overview:visible')).toHaveAttribute('aria-current', 'page');
    await capture(page, 'invalid-section-320');
  }
});

const fixtureUser = {
  id: 7007,
  firstName: 'Ada',
  lastName: 'Collector',
  email: 'fixture@example.test',
  role: 'USER',
  isActive: true,
  phone: '',
  address: '',
  gender: null,
  createdAt: '2026-01-01T00:00:00Z',
};
const membership = {
  active: true,
  policyVersion: 1,
  balances: {
    available: 100,
    lifetime: 100,
    used: 0,
    debt: 0,
    tier: { name: 'MEMBER', points: 0, discountPercent: 0 },
    nextTier: { name: 'BRONZE', points: 150, discountPercent: 2 },
  },
  rewards: [
    { key: 'fixture-reward', kind: 'fixed', points: 60, amount: 50000, minOrderVnd: 500000, maxDiscountVnd: 50000 },
  ],
  gifts: [],
  history: [],
  wallet: [],
  claims: [],
};

test('profile save failure keeps edits and a successful retry updates the identity', async ({ page }) => {
  test.skip(!hasCustomer, 'The existing route requires a real session cookie');
  expect((await page.request.post('/api/auth/login', { data: customer })).ok()).toBe(true);
  let user = fixtureUser;
  let attempts = 0;
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { user } }));
  await page.route('**/api/loyalty', (route) => route.fulfill({ json: membership }));
  await page.route('**/api/users/me', (route) => {
    attempts++;
    if (attempts === 1) return route.fulfill({ status: 503, json: {} });
    user = { ...user, ...route.request().postDataJSON() };
    return route.fulfill({ json: user });
  });
  await page.goto('/en/user-profile?section=account');
  await page.getByRole('button', { name: 'Update First name', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(en.profile.firstName, { exact: true }).fill('Updated fixture');
  await dialog.getByRole('button', { name: en.profile.update, exact: true }).click();
  await expect(dialog).toContainText(en.profile.saveFailed);
  await expect(dialog.getByLabel(en.profile.firstName, { exact: true })).toHaveValue('Updated fixture');
  await dialog.getByRole('button', { name: en.profile.update, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.account-identity')).toContainText('Updated fixture');
});

test('reward retry preserves request identity and refreshes the overview balance', async ({ page }) => {
  test.skip(!hasCustomer, 'The existing route requires a real session cookie');
  expect((await page.request.post('/api/auth/login', { data: customer })).ok()).toBe(true);
  let overview = structuredClone(membership);
  const keys: string[] = [];
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { user: fixtureUser } }));
  await page.route('**/api/loyalty', (route) => route.fulfill({ json: overview }));
  await page.route('**/api/loyalty/redeem', (route) => {
    keys.push(route.request().postDataJSON().requestKey);
    if (keys.length === 1) return route.fulfill({ status: 503, json: {} });
    overview = { ...overview, balances: { ...overview.balances, available: 40, used: 60 } };
    return route.fulfill({ json: {} });
  });
  await page.goto('/en/user-profile?section=membership');
  const redeem = page.locator('.account-membership').getByRole('button', { name: en.loyalty.redeem, exact: true });
  await redeem.click();
  await expect(redeem).toBeEnabled();
  await redeem.click();
  await expect.poll(() => keys.length).toBe(2);
  expect(keys[0]).toBe(keys[1]);
  await page.locator('#account-nav-overview:visible').click();
  await expect(page.locator('.account-stats article').first().locator('strong')).toHaveText('40');
});

test('membership failure retries and the old service URL opens the unified member section', async ({ page }) => {
  test.skip(!hasCustomer, 'Requires synthetic customer');
  expect((await page.request.post('/api/auth/login', { data: customer })).ok()).toBe(true);
  await page.route('**/api/loyalty', (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto('/en/user-profile');
  await expect(page.getByRole('alert').filter({ hasText: en.accountHub.membershipFailed })).toBeVisible();
  await page.unroute('**/api/loyalty');
  await page.locator('.account-notice').getByRole('button', { name: en.common.retry }).click();
  await expect(page.locator('.account-member-card h2')).not.toHaveText(en.accountHub.unavailable);
  await expect(page.locator('.account-member-card h2')).not.toHaveText(en.common.loading);
  await page.goto('/en/services/loyalty');
  await expect(page).toHaveURL(/user-profile\?section=membership/);
  await expect(page.locator('.account-membership')).toBeVisible();
});
