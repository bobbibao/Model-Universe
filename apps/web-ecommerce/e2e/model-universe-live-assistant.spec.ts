import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import en from '../src/messages/en.json';
import vi from '../src/messages/vi.json';

for (const locale of ['vi', 'en']) for (const width of [1440, 390]) {
  test(`${locale} ${width}: assistant keyboard focus returns to the product research control`, async ({ page }) => {
    const messages = locale === 'en' ? en : vi;
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const response = await page.request.get('/api/products?per_page=100&inStock=true');
    expect(response.ok()).toBeTruthy();
    const product = (await response.json()).payload.data.find((item: { grade?: string; scale?: string }) => item.grade && item.scale);
    expect(product).toBeTruthy();
    await page.goto(`/${locale}/shop/product/${product.id}`);
    const opener = page.getByRole('button', { name: new RegExp(messages.catalog.askAssistant) });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: messages.assistant.name, exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: messages.assistant.messageLabel })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
  });
}

// Opt-in real model acceptance; no API interception, model doubles or financial writes.
for (const locale of ['vi', 'en']) for (const width of [1440, 390]) {
  test(`${locale} ${width}: live assistant grounds current kit and preserves customer consent`, async ({ page }) => {
    test.skip(process.env.E2E_LIVE_ASSISTANT !== '1', 'Requires a configured, isolated live-model agent server.');
    test.setTimeout(240000);
    const messages = locale === 'en' ? en : vi, labels = messages.assistant;
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const catalogResponse = await page.request.get('/api/products?per_page=100&inStock=true');
    expect(catalogResponse.ok()).toBeTruthy();
    const catalog = (await catalogResponse.json()).payload.data;
    const product = catalog.find((item: { grade?: string; scale?: string; stock: number }) => item.grade && item.scale && item.stock > 0);
    expect(product).toBeTruthy();
    await page.goto(`/${locale}/assistant`);
    await expect(page.getByRole('heading', { name: labels.workspaceTitle })).toBeVisible();
    await expect(page.getByRole('textbox', { name: labels.messageLabel })).toBeVisible();
    await expect(page.getByText(/giày|shoes/i)).toHaveCount(0);
    await page.goto(`/${locale}/shop/product/${product.id}`);
    // Mobile deliberately hides the floating launcher; the product research button opens the same dialog.
    const opener = width === 390
      ? page.getByRole('button', { name: new RegExp(messages.catalog.askAssistant) })
      : page.getByRole('button', { name: labels.open, exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: labels.name, exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('checkbox', { name: labels.deepResearch, exact: true }).uncheck();
    const prompt = locale === 'en'
      ? 'Research the current model using only the provided shop facts. Include this model in your product recommendations, state its current price, grade and scale. Do not propose or execute any actions.'
      : 'Nghiên cứu mô hình đang xem chỉ từ thông tin cửa hàng. Đưa mô hình này vào danh sách gợi ý, cho biết giá hiện tại, grade và tỉ lệ. Không đề xuất hoặc thực hiện thao tác nào.';
    await dialog.getByRole('textbox', { name: labels.messageLabel }).fill(prompt);
    const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/assistant/chat') && response.request().method() === 'POST', { timeout: 210000 });
    const started = Date.now();
    await dialog.getByRole('button', { name: labels.sendMessage, exact: true }).click();
    const response = await responsePromise;
    expect(response.ok(), await response.text()).toBeTruthy();
    const reply = (await response.json()).data;
    expect(reply.answer.length).toBeGreaterThan(20);
    expect(reply.answer.replace(/:/g, '/')).toContain(product.scale);
    expect(reply.products.map((item: { id: number }) => item.id)).toContain(product.id);
    expect(reply.products.find((item: { id: number }) => item.id === product.id).salePrice).toBe(product.salePrice);
    expect(reply.actions).toEqual([]);
    expect(reply.sources.some((source: { path: string }) => source.path === `/shop/product/${product.id}`)).toBeTruthy();
    await expect(dialog.locator('.agent-answer').last()).toContainText(product.grade);
    await expect(dialog.locator('.agent-product-link').first()).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cart') || '[]').length)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    expect(errors).toEqual([]);
    const artifacts = path.resolve('../../.artifacts/model-universe/visual');
    fs.mkdirSync(artifacts, { recursive: true });
    await page.screenshot({ path: path.join(artifacts, `${locale}-${width}-live-assistant.png`), fullPage: width !== 390 });
    fs.writeFileSync(path.join(artifacts, `${locale}-${width}-live-assistant.json`), JSON.stringify({ locale, width, elapsedMs: Date.now() - started, reply }, null, 2));
    await test.info().attach('live-response', { body: JSON.stringify({ locale, width, elapsedMs: Date.now() - started, reply }, null, 2), contentType: 'application/json' });
    await dialog.getByRole('button', { name: labels.closePanel }).click();
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
  });
}
