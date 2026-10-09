import { expect, test } from '@playwright/test';
import { randomUUID } from 'crypto';
import path from 'path';
import { admin, hasAdmin } from './helpers';
import en from '../src/messages/en.json';
import vi from '../src/messages/vi.json';

for (const locale of ['vi', 'en'] as const) for (const width of [1440, 390]) {
  test(`${locale} ${width}: actual agent outage becomes a retryable admin error`, async ({ page }) => {
    test.skip(!hasAdmin || process.env.E2E_AGENT_OUTAGE !== 'dedicated_browser_test',
      'Requires a synthetic admin and a deliberately disconnected agent on an isolated web database.');
    const labels = (locale === 'en' ? en : vi).agentStatus;
    const threadId = randomUUID();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    expect((await page.request.post('/api/auth/login', { data: admin })).ok()).toBeTruthy();
    const failure = page.waitForResponse(response =>
      response.url().includes(`/api/admin/agent/server/threads/${threadId}`) && response.status() >= 500);
    await page.goto(`/${locale}/admin/agent/threads/${threadId}`);
    await failure;
    await expect(page.getByRole('alert').filter({ hasText: labels.loadFailed })).toBeVisible();
    await expect(page.getByRole('status', { name: labels.loading })).toHaveCount(0);
    await page.screenshot({ path: path.resolve(`../../.artifacts/model-universe/visual/agent-admin-outage-${locale}-${width}.png`), fullPage: true });

    // Recovery is an explicit read-only thread double. No decision or shop write is submitted.
    let mutationRequests = 0;
    await page.route(`**/api/admin/agent/server/threads/${threadId}**`, async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.includes('/runs')) mutationRequests++;
      let data: unknown = {
        thread_id: threadId, status: 'idle', metadata: { title: 'Synthetic recovered agent thread' },
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(), values: { stage: 'closed' },
      };
      if (pathname.endsWith('/state')) data = { values: { stage: 'closed' }, tasks: [], next: [] };
      if (pathname.endsWith('/history')) data = [];
      await route.fulfill({ json: data });
    });
    await page.getByRole('button', { name: labels.retry, exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Synthetic recovered agent thread', exact: true })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: labels.loadFailed })).toHaveCount(0);
    expect(mutationRequests).toBe(0);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  });
}
