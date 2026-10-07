import { expect, test } from '@playwright/test';
import { admin, hasAdmin, signIn } from './helpers';
import type { MarketingDraft, MarketingDraftInput } from '../src/shared/types/admin-marketing';

test('admin edits Agent copy before publishing and can select ad channels', async ({ page }) => {
  test.skip(!hasAdmin, 'Requires an admin login; all marketing writes in this test are mocked');
  const drafts: MarketingDraft[] = [];
  let sent: MarketingDraftInput | undefined;
  await page.route('**/api/admin/marketing/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let data: unknown = [];
    if (pathname.endsWith('/options'))
      data = { products: [], assets: [], modes: { facebook: 'fake', meta: 'fake', google: 'fake', tiktok: 'fake' } };
    if (pathname.endsWith('/suggest'))
      data = {
        message: 'Nội dung Agent gợi ý',
        headline: '',
        primaryText: '',
        headlines: [],
        descriptions: [],
        keywords: [],
        adText: '',
      };
    if (pathname.endsWith('/drafts')) {
      if (request.method() === 'GET') data = drafts;
      else {
        const draft: MarketingDraft = {
          id: 1,
          ref: 'adm-ui-test',
          createdBy: 1,
          status: 'draft',
          input: request.postDataJSON(),
          updatedAt: new Date().toISOString(),
        };
        drafts.push(draft);
        data = draft;
      }
    }
    if (pathname.endsWith('/save')) {
      drafts[0].input = request.postDataJSON();
      data = drafts[0];
    }
    if (pathname.endsWith('/publish')) {
      sent = drafts[0].input;
      drafts[0].status = 'submitted';
      drafts[0].postStatus = 'published';
      drafts[0].campaignStatus = 'active';
      data = drafts[0];
    }
    await route.fulfill({ json: { statusCode: 200, data, userMessages: [] } });
  });
  await signIn(page, admin, '/admin/marketing');
  await expect(page.getByRole('heading', { name: 'Soạn chiến dịch' })).toBeVisible();
  await page.getByLabel('Tên chiến dịch', { exact: true }).fill('Chiến dịch mùa thu');
  await page.getByLabel('Yêu cầu nội dung', { exact: true }).fill('Giới thiệu bộ sưu tập');
  await page.getByRole('button', { name: 'Nhờ Agent gợi ý', exact: true }).click();
  await expect(page.getByLabel('Nội dung bài post', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Dùng gợi ý để chỉnh sửa', exact: true }).click();
  await expect(page.getByLabel('Nội dung bài post', { exact: true })).toHaveValue('Nội dung Agent gợi ý');
  await page.getByLabel('Nội dung bài post', { exact: true }).fill('Nội dung admin đã chỉnh sửa');
  await page.getByRole('button', { name: 'Đăng bài', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tạo bản sao để chỉnh sửa' })).toBeVisible();
  expect(sent?.message).toBe('Nội dung admin đã chỉnh sửa');
  expect(drafts).toHaveLength(1);
  await page.getByRole('button', { name: '+ Chiến dịch mới', exact: true }).click();
  await page.getByRole('combobox', { name: 'Kênh marketing' }).selectOption('google');
  await expect(page.getByLabel('Tiêu đề (3–15 dòng, tối đa 30 ký tự/dòng)', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
