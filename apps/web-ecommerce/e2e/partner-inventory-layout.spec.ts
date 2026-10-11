import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { signSessionToken } from '../src/shared/server/utils/JwtUtils';
import type { PartnerListing } from '../src/shared/types/partner';
import vi from '../src/messages/vi.json';
import en from '../src/messages/en.json';

// Only the isolated local preview uses this synthetic session. Every API request is mocked.
const fixturePreview = process.env.E2E_UI_FIXTURE === '1' && process.env.E2E_BASE_URL === 'http://localhost:6051';
const listing: PartnerListing = {
  id: 900001,
  partnerId: 900001,
  sku: 'UI-FIXTURE',
  name: 'Synthetic RG model inventory fixture',
  brandName: 'Fixture',
  price: 1350000,
  stock: 2,
  imageUrl: '/images/store/product-placeholder.svg',
  description: 'Synthetic listing for layout verification only.',
  grade: 'RG',
  scale: '1/144',
  series: 'Fixture',
  modelCode: 'UI-144',
  condition: 'new',
  assemblyState: 'unassembled',
  boxCondition: 'New',
  includedAccessories: [],
  defects: [],
  categoryId: 1,
  dispatchDays: 2,
  listingStatus: 'review',
  listingVersion: 1,
  photos: [],
  events: [],
};

for (const locale of ['vi', 'en'] as const) {
  for (const width of [1440, 390]) {
    test(`${locale} ${width}: compact partner queue and selected listing`, async ({ page, context }) => {
      test.skip(!fixturePreview, 'Requires the isolated local preview and mocked APIs.');
      loadEnvConfig(process.cwd());
      await context.addCookies([
        {
          name: 'access_token',
          value: await signSessionToken(900001, 'ADMIN'),
          url: 'http://localhost:6051',
          httpOnly: true,
        },
      ]);
      const messages = locale === 'vi' ? vi : en;
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/api/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        let data: unknown = {};
        if (pathname === '/api/auth/me')
          data = {
            user: { id: 900001, role: 'ADMIN', firstName: 'UI', lastName: 'Fixture', email: 'ui@example.test' },
          };
        else if (pathname === '/api/admin/partner-listings') data = { rows: [listing], count: 1 };
        else if (pathname.endsWith('/guarantee')) data = { quote: null, policyRequired: false, guarantees: [] };
        else if (pathname === `/api/admin/partner-listings/${listing.id}`) data = listing;
        await route.fulfill({ json: { data } });
      });
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(
        (theme) => localStorage.setItem('color-theme', JSON.stringify(theme)),
        width === 1440 ? 'light' : 'dark',
      );
      await page.goto(`/${locale}/admin/partner-listings`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages.partnerListings.adminTitle);
      const heading = await page.locator('.admin-page-heading').boundingBox();
      expect(heading!.height).toBeLessThan(width === 1440 ? 45 : 80);
      if (width === 1440)
        await expect(page.getByText(messages.partnerListings.selectListing, { exact: true })).toBeVisible();
      const row = page.locator('.partner-listing-row');
      await expect(row).toHaveAttribute('aria-pressed', 'false');
      await row.click();
      await expect(row).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#seller-listing-detail h2').first()).toHaveText(listing.name);
      await expect(page.getByRole('form', { name: messages.partnerListings.reviewForm })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const folder = resolve('../../.artifacts/model-universe/premium-ui');
      await mkdir(folder, { recursive: true });
      await page.screenshot({ path: resolve(folder, `${locale}-${width}-partner-inventory.png`), fullPage: true });
      expect(errors).toEqual([]);
    });
  }
}
