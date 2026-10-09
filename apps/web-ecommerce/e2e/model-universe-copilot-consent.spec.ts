import { expect, test } from '@playwright/test';
import { randomUUID } from 'crypto';
import { admin, hasAdmin } from './helpers';

for (const width of [1440, 390]) for (const decision of ['approve', 'edit', 'reject', 'failed-approve']) {
  test(`${width}: copilot ${decision} submits only the human decision`, async ({ page }) => {
    test.skip(!hasAdmin || process.env.E2E_AGENT_CONSENT !== 'dedicated_browser_test',
      'Requires a synthetic admin; all agent endpoints are explicit doubles and no shop write is executed.');
    const threadId = randomUUID();
    const callId = randomUUID();
    const args = { code: 'MODEL-QA-ONLY', title: 'Synthetic approval proposal', percent: 10,
      duration_days: 7, min_order_vnd: 500000 };
    const request = {
      action_requests: [{ name: 'create_coupon', args, description: 'Synthetic approval proposal' }],
      review_configs: [{ action_name: 'create_coupon', allowed_decisions: ['approve', 'edit', 'reject'] }],
    };
    let submitted: { command?: { resume?: { decisions?: unknown } } } | undefined;
    let attempts = 0;
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const paused = { type: 'ai', id: 'proposal', content: 'Synthetic draft awaiting your decision.',
      tool_calls: [{ id: callId, name: 'create_coupon', args }] };
    const finished = { type: 'ai', id: 'finished', content: 'Synthetic decision recorded; no live shop write was executed.' };
    const values = () => ({ messages: submitted ? [finished] : [paused] });
    await page.route('**/api/admin/agent/server/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.endsWith('/runs/stream')) {
        attempts++;
        if (decision === 'failed-approve' && attempts === 1) {
          await route.fulfill({ status: 503, json: { detail: 'Synthetic agent outage' } });
          return;
        }
        submitted = route.request().postDataJSON();
        await route.fulfill({ contentType: 'text/event-stream', body:
          `event: metadata\ndata: ${JSON.stringify({ run_id: randomUUID(), attempt: 1 })}\n\n` +
          `event: values\ndata: ${JSON.stringify(values())}\n\nevent: end\ndata: {}\n\n` });
        return;
      }
      let data: unknown = [];
      const thread = { thread_id: threadId, status: submitted ? 'idle' : 'interrupted', metadata: { graph_id: 'assistant' },
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(), values: values() };
      if (pathname.endsWith('/search')) data = [thread];
      else if (pathname.endsWith('/state')) data = { values: values(), next: submitted ? [] : ['tools'],
        tasks: submitted ? [] : [{ id: 'task', name: 'tools', interrupts: [{ id: 'approval', value: request }] }],
        interrupts: submitted ? [] : [{ id: 'approval', value: request }], checkpoint: { thread_id: threadId } };
      else if (pathname.endsWith('/history')) data = [];
      else data = thread;
      await route.fulfill({ json: data });
    });
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    expect((await page.request.post('/api/auth/login', { data: admin })).ok()).toBeTruthy();
    await page.goto('/vi/admin/agent/copilot');
    await page.getByRole('button', { name: /Trò chuyện.*chờ duyệt/ }).click();
    await expect(page.getByRole('heading', { name: 'Trợ lý cần bạn duyệt trước khi thực hiện' })).toBeVisible();
    expect(submitted).toBeUndefined();
    if (decision === 'edit') {
      await page.getByLabel('Sửa rồi duyệt', { exact: true }).check();
      await page.getByLabel('Mức giảm (%)', { exact: true }).fill('17');
    }
    if (decision === 'reject') {
      await page.getByLabel('Từ chối', { exact: true }).check();
      await page.getByPlaceholder('Lý do (không bắt buộc)').fill('Synthetic rejection note');
    }
    await page.getByRole('button', { name: 'Gửi quyết định', exact: true }).click();
    if (decision === 'failed-approve') {
      await expect(page.getByText('Trợ lý gặp lỗi, vui lòng thử lại.', { exact: true })).toBeVisible();
      expect(attempts).toBe(1);
      expect(submitted).toBeUndefined();
      await page.getByRole('button', { name: 'Gửi quyết định', exact: true }).click();
    }
    await expect(page.getByText(finished.content, { exact: true })).toBeVisible();
    expect(submitted?.command?.resume?.decisions).toEqual([
      decision === 'edit' ? { type: 'edit', args: { percent: 17 } } :
        decision === 'reject' ? { type: 'reject', note: 'Synthetic rejection note' } : { type: 'approve' },
    ]);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  });
}
