import { expect, test } from '@playwright/test';
import { SignJWT } from 'jose';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import en from '../src/messages/en.json';
import vi from '../src/messages/vi.json';
import type { MarketingDraft, MarketingOptions } from '../src/shared/types/admin-marketing';

// Offline UI coverage: use only with a separate Next preview started with the same test-only JWT secret.
// Every API request is intercepted. No drafts, uploads or posts reach the running shop or external platforms.
test.use({ timezoneId: 'Asia/Ho_Chi_Minh' });
const options: MarketingOptions = {
  modes: { facebook: 'fake', meta: 'fake', google: 'fake', tiktok: 'fake' },
  products: [
    {
      id: 1,
      sku: 'RG-UNICORN',
      name: 'RG Unicorn Gundam',
      price: 890000,
      imageUrl: '/images/catalog/unicorn-ntd-front.webp',
      images: [
        { id: 11, url: '/images/catalog/unicorn-ntd-side.webp' },
        { id: 12, url: '/images/catalog/unicorn-ntd-detail.webp' },
      ],
    },
    {
      id: 2,
      sku: 'MG-FREEDOM',
      name: 'MG Strike Freedom',
      price: 1450000,
      imageUrl: '/images/catalog/strike-freedom-custom.webp',
      images: [{ id: 21, url: '/images/catalog/strike-freedom-custom-side.webp' }],
    },
    { id: 3, sku: 'RG-ZAKU', name: 'RG Zaku II', price: 690000, imageUrl: '/images/catalog/rg-zaku-ii-box.webp' },
  ],
  assets: [{ id: 50, title: 'Bộ sưu tập tháng 10', kind: 'image', url: '/images/catalog/gundam-unicorn.webp' }],
};

for (const locale of ['vi', 'en'] as const)
  for (const width of [1440, 390]) {
    test(`${locale} ${width}: select products, order photos, upload a batch, schedule and reopen a draft`, async ({
      page,
      context,
    }) => {
      test.setTimeout(120000);
      test.skip(!process.env.E2E_UI_JWT_SECRET, 'Requires the isolated UI preview with a test-only JWT secret');
      const messages = (locale === 'vi' ? vi : en).marketingStudio;
      const s = messages.selection,
        c = messages.calendar;
      const token = await new SignJWT({ typ: 'session', role: 'ADMIN' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('1')
        .setExpirationTime('10m')
        .sign(new TextEncoder().encode(process.env.E2E_UI_JWT_SECRET!));
      await context.addCookies([
        { name: 'access_token', value: token, url: process.env.E2E_BASE_URL || 'http://localhost:6054' },
      ]);
      await page.addInitScript(
        (theme) => localStorage.setItem('color-theme', JSON.stringify(theme)),
        locale === 'vi' ? 'light' : 'dark',
      );
      await page.setViewportSize({ width, height: 1000 });
      await page.clock.setFixedTime(new Date('2026-10-19T03:00:00Z'));
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      let draft: MarketingDraft | undefined;
      const settings = structuredClone(options);
      settings.products.push(
        ...Array.from({ length: 72 }, (_, index) => ({
          id: 100 + index,
          sku: `BULK-${index}`,
          name: `Model ${index}`,
          price: 100000,
          imageUrl: '/images/catalog/gundam-unicorn.webp',
        })),
      );
      settings.assets.push(
        ...Array.from({ length: 72 }, (_, index) => ({
          id: 1000 + index,
          title: `Library ${index}`,
          kind: 'image' as const,
          url: '/images/catalog/gundam-dynames.webp',
        })),
      );
      let uploads = 0;
      await page.route('**/api/**', async (route) => {
        const request = route.request(),
          path = new URL(request.url()).pathname;
        let data: unknown = [];
        if (path === '/api/auth/me') data = { id: 1, role: 'ADMIN', name: 'Studio Owner', email: 'owner@example.test' };
        if (path.endsWith('/marketing/options')) data = settings;
        if (path.endsWith('/marketing/suggest')) {
          expect(request.postDataJSON().skus).toEqual(['RG-UNICORN', 'MG-FREEDOM']);
          data = {
            message: 'Collection suggested by Agent',
            headline: '',
            primaryText: '',
            headlines: [],
            descriptions: [],
            keywords: [],
            adText: '',
          };
        }
        if (path.endsWith('/marketing/drafts') && request.method() === 'GET') data = draft ? [draft] : [];
        if ((path.endsWith('/marketing/drafts') || path.endsWith('/save')) && request.method() === 'POST') {
          draft = {
            id: 1,
            ref: 'adm-composer-test',
            createdBy: 1,
            status: 'draft',
            input: request.postDataJSON(),
            updatedAt: new Date().toISOString(),
          };
          data = draft;
        }
        if (path.endsWith('/assets/upload')) {
          uploads++;
          const asset = {
            id: 60 + uploads,
            title: `upload-${uploads}.png`,
            kind: 'image' as const,
            url: '/images/catalog/gundam-dynames.webp',
          };
          settings.assets.unshift(asset);
          data = asset;
        }
        await route.fulfill({ json: { statusCode: 200, data, userMessages: [] } });
      });
      await page.goto(`/${locale}/admin/marketing`);
      await page.getByLabel(messages.name, { exact: true }).fill('Bộ sưu tập Gunpla · Tháng 10');
      const search = page.getByRole('searchbox', { name: s.searchProducts });
      expect(
        await search.evaluate((element) => ({
          border: getComputedStyle(element).borderLeftWidth,
          background: getComputedStyle(element).backgroundColor,
        })),
      ).toEqual({ border: '0px', background: 'rgba(0, 0, 0, 0)' });
      await search.fill('unicorn');
      await page.getByRole('checkbox', { name: 'RG Unicorn Gundam', exact: true }).check();
      await page.getByRole('searchbox', { name: s.searchProducts }).fill('freedom');
      await page.getByRole('checkbox', { name: 'MG Strike Freedom', exact: true }).check();
      await page.getByRole('searchbox', { name: s.searchProducts }).fill('');
      await expect(page.getByLabel(messages.linkPath, { exact: true })).toHaveValue('/cua-hang');
      await page
        .getByRole('group', { name: s.mediaLibrary, exact: true })
        .getByRole('button', { name: 'RG Unicorn Gundam', exact: true })
        .nth(1)
        .click();
      await page.getByRole('button', { name: s.moveEarlier.replace('{index}', '3'), exact: true }).click();
      await page.getByLabel(s.uploadLabel, { exact: true }).setInputFiles([
        { name: 'collection-1.png', mimeType: 'image/png', buffer: Buffer.from('mock-image-one') },
        { name: 'collection-2.png', mimeType: 'image/png', buffer: Buffer.from('mock-image-two') },
      ]);
      await expect.poll(() => uploads).toBe(2);
      await expect(page.locator('.mk-media-selected li')).toHaveCount(5);
      await page.getByRole('button', { name: messages.agent.trigger, exact: true }).click();
      await page.getByRole('button', { name: s.ideas.collection, exact: true }).click();
      await page.getByRole('button', { name: messages.agent.run, exact: true }).click();
      await expect(page.locator('.mk-agent-result')).toContainText('Collection suggested by Agent');
      await expect(page.getByLabel(messages.fields.message, { exact: true })).toHaveValue('');
      await page.getByRole('button', { name: messages.agent.apply, exact: true }).click();
      await expect(page.getByLabel(messages.fields.message, { exact: true })).toHaveValue(
        'Collection suggested by Agent',
      );
      await page
        .getByLabel(messages.fields.message, { exact: true })
        .fill(
          'Khám phá bộ sưu tập Gunpla: Unicorn và Strike Freedom. Chọn bộ kit cho hành trình build tiếp theo của bạn.',
        );
      await page.getByRole('button', { name: c.tomorrow, exact: true }).click();
      await page.locator('.mk-date-trigger').click();
      await expect(page.getByRole('button', { name: c.previousMonth, exact: true })).toBeDisabled();
      await page.getByRole('button', { name: c.nextMonth, exact: true }).click();
      await expect(page.getByRole('button', { name: c.nextMonth, exact: true })).toBeDisabled();
      await page.getByRole('button', { name: c.previousMonth, exact: true }).click();
      const days = page.getByRole('group', { name: c.chooseDay, exact: true });
      const dateLabel = (day: number) =>
        new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', {
          dateStyle: 'full',
          timeZone: 'Asia/Ho_Chi_Minh',
        }).format(new Date(`2026-10-${day}T03:00:00Z`));
      await expect(days.getByRole('button', { name: dateLabel(18), exact: true })).toBeDisabled();
      await days.getByRole('button', { name: dateLabel(19), exact: true }).click();
      await page.getByLabel(c.hour, { exact: true }).fill('09');
      await page.getByLabel(c.minute, { exact: true }).fill('00');
      await expect(page.getByRole('button', { name: c.confirm, exact: true })).toBeDisabled();
      await days.getByRole('button', { name: dateLabel(20), exact: true }).click();
      await page.getByLabel(c.hour, { exact: true }).fill('20');
      await page.getByLabel(c.minute, { exact: true }).fill('30');
      const artifacts = resolve(__dirname, '../../../.artifacts/marketing-composer');
      await mkdir(artifacts, { recursive: true });
      await page.locator('.mk-calendar').screenshot({ path: resolve(artifacts, `${locale}-${width}-calendar.png`) });
      await page.getByRole('button', { name: c.confirm, exact: true }).click();
      await page.getByRole('button', { name: messages.actions.save, exact: true }).click();
      await expect
        .poll(() => draft?.input.mediaKeys)
        .toEqual(['product:RG-UNICORN', 'image:11', 'product:MG-FREEDOM', 'asset:61', 'asset:62']);
      expect(draft?.input.skus).toEqual(['RG-UNICORN', 'MG-FREEDOM']);
      expect(draft?.input.scheduledAt).toBe('2026-10-20T13:30:00.000Z');
      await page.getByRole('button', { name: messages.newCampaign, exact: true }).click();
      await page.getByRole('button', { name: messages.campaigns.replace('{count}', '1'), exact: true }).click();
      await page.locator('.mk-campaign').click();
      await expect(page.locator('.mk-media-selected li')).toHaveCount(5);
      await expect(page.getByRole('checkbox', { name: 'RG Unicorn Gundam', exact: true })).toBeChecked();
      await expect(page.locator('.mk-date-trigger strong')).toContainText('20:30');
      await page.locator('.mk-selection').first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: resolve(artifacts, `${locale}-${width}-composer.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const products = page.getByRole('group', { name: s.products, exact: true });
      await page.getByRole('button', { name: s.selectResults, exact: true }).click();
      await expect(products.getByRole('checkbox', { checked: true })).toHaveCount(75);
      await page.getByRole('button', { name: s.selectAllImages, exact: true }).click();
      expect(await page.locator('.mk-media-selected li').count()).toBeGreaterThan(100);
      await page.getByRole('button', { name: messages.actions.save, exact: true }).click();
      await expect.poll(() => draft?.input.skus?.length).toBe(75);
      expect(draft?.input.mediaKeys!.length).toBeGreaterThan(100);
      expect(errors).toEqual([]);
    });
  }
