// Read-only prelaunch lab measurements against an already running production server.
// These local timings are not field Core Web Vitals or a Lighthouse score.
const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const baseURL = process.env.MODEL_UNIVERSE_BASE_URL || 'http://localhost:6050';
  const browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || 'chrome' });
  const result = { measuredAt: new Date().toISOString(), baseURL, conditions: 'Installed Chrome, fresh cache per route, local network, no CPU/network throttling, three seconds after load; concurrent host work must be recorded separately.', routes: [], catalog: {} };
  try {
    const context = await browser.newContext({ baseURL });
    const catalog = await context.request.get('/api/products?per_page=100');
    if (!catalog.ok()) throw new Error('The public catalog must be ready before measuring.');
    const products = (await catalog.json()).payload.data;
    const product = products.find(row => row.name.includes('Zaku')) || products[0];
    if (!product) throw new Error('A real published product is required.');
    const timings = [];
    for (let index = 0; index < 30; index++) {
      const started = performance.now();
      const response = await context.request.get('/api/products?per_page=12');
      if (!response.ok()) throw new Error('Catalog read failed during measurement.');
      await response.body(); timings.push(performance.now() - started);
    }
    timings.sort((a, b) => a - b);
    result.catalog = { visibleProductsInSample: products.length, requests: timings.length, concurrency: 1, medianMs: timings[Math.floor(timings.length / 2)], p95Ms: timings[Math.ceil(timings.length * .95) - 1] };
    await context.close();
    for (const locale of ['vi', 'en']) for (const width of [390, 1440]) for (const route of ['', '/shop', `/shop/product/${product.id}`]) {
      const measurement = await browser.newContext({ baseURL, viewport: { width, height: 900 }, locale: locale === 'vi' ? 'vi-VN' : 'en-US' });
      try {
        const page = await measurement.newPage();
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => {
          window.__modelUniverseLab = { lcpMs: null, cls: 0 };
          new PerformanceObserver(list => { for (const entry of list.getEntries()) {
            window.__modelUniverseLab.lcpMs = entry.startTime;
            window.__modelUniverseLab.lcpElement = { tag: entry.element?.tagName, imageUrl: entry.url || null };
          } }).observe({ type: 'largest-contentful-paint', buffered: true });
          new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__modelUniverseLab.cls += entry.value; }).observe({ type: 'layout-shift', buffered: true });
        });
        const response = await page.goto(`/${locale}${route}`, { waitUntil: 'load' });
        if (response.status() !== 200) throw new Error('Measurement route failed.');
        await page.waitForTimeout(3000); // Fixed observation window, not a UI acceptance wait.
        const metrics = await page.evaluate(() => {
          const resources = performance.getEntriesByType('resource');
          const sum = entries => entries.reduce((total, entry) => total + entry.encodedBodySize, 0);
          const navigation = performance.getEntriesByType('navigation')[0];
          return {
            ...window.__modelUniverseLab,
            ttfbMs: navigation.responseStart,
            loadMs: navigation.loadEventEnd,
            executableJsBytes: sum(resources.filter(entry => /\.js(?:\?|$)/.test(entry.name))),
            imageBytes: sum(resources.filter(entry => entry.initiatorType === 'img' || /\.(?:avif|webp|png|jpe?g|gif|svg)(?:\?|$)/i.test(entry.name))),
            resourceCount: resources.length,
            slowResources: resources.filter(entry => entry.duration > 500).sort((a, b) => b.duration - a.duration).slice(0, 10).map(entry => ({ path: new URL(entry.name).pathname, initiator: entry.initiatorType, durationMs: entry.duration, responseEndMs: entry.responseEnd })),
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        result.routes.push({ locale, width, route: route || '/', ...metrics, errors });
      } finally { await measurement.close(); }
    }
  } finally { await browser.close(); }
  const output = path.resolve(process.env.MODEL_UNIVERSE_METRICS_OUTPUT || '../../.artifacts/model-universe/production-metrics.json');
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
