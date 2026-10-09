// Measures the real custom dev server. Only use a disposable *_test database.
// The HMR probe adds/removes one temporary data attribute in Search.tsx; other edits are preserved.
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const source = path.resolve('src/core/client/features/shop/pages/Search.tsx');
const attribute = / data-model-universe-hmr-probe="\d+"/g;
const section = '<section className="mu-wrap mu-section"';

function stop(child) {
  if (child.exitCode !== null) return;
  if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else child.kill('SIGTERM');
}
async function main() {
  if (!process.env.DB_NAME?.endsWith('_test')) throw new Error('DB_NAME must identify a disposable *_test database.');
  const port = 6053, baseURL = `http://localhost:${port}`;
  const occupied = await fetch(`${baseURL}/api/products`, { signal: AbortSignal.timeout(1500) }).then(() => true, () => false);
  if (occupied) throw new Error('Measurement port 6053 is already occupied.');
  const result = { measuredAt: new Date().toISOString(), completed: false, conditions: 'Local Windows, actual custom server + Turbopack, same dev cache between runs, full document route loads and separate actual link navigation; HMR waits for the real Search subscription before timing edits. Not field Web Vitals.', readyMs: [], routes: [], spaRoutes: [], hmrMs: [] };
  const output = path.resolve('../../.artifacts/model-universe/development-metrics.json');
  const save = () => { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n'); };
  save();
  try {
  for (let run = 0; run < 3; run++) {
    const started = performance.now();
    const child = spawn(process.execPath, [require.resolve('ts-node/dist/bin.js'), '--transpile-only', 'server.ts'], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'development', TURBOPACK: '1', NEXT_DIST_DIR: 'dist/.next-performance-dev', PORT: String(port), SEED_DATA: 'false', DROP_TABLES: 'false', LOG_LEVEL: 'error' },
    });
    // Drain output without logging credentials or mixing compiler output into the metric JSON.
    child.stdout.resume(); child.stderr.resume();
    let browser;
    try {
      let product;
      while (performance.now() - started < 60000) {
        if (child.exitCode !== null) throw new Error(`Dev server exited with ${child.exitCode}.`);
        const response = await fetch(`${baseURL}/api/products?per_page=1`, { signal: AbortSignal.timeout(1000) }).catch(() => null);
        if (response?.ok) { product = (await response.json()).payload.data[0]; break; }
        await wait(100);
      }
      if (!product) throw new Error('Dev server did not become ready with a real catalog within 60 seconds.');
      result.readyMs.push(performance.now() - started);
      save();
      if (run !== 0) continue;
      browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || 'chrome' });
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      let hmr = { connected: false, searchSubscribed: false };
      page.on('websocket', socket => {
        if (!socket.url().includes('/_next/webpack-hmr')) return;
        const state = { connected: false, searchSubscribed: false }; hmr = state;
        socket.on('framereceived', event => {
          try { if (JSON.parse(String(event.payload)).action === 'turbopack-connected') state.connected = true; } catch {}
        });
        socket.on('framesent', event => {
          try {
            const message = JSON.parse(String(event.payload));
            if (state.connected && message.type === 'turbopack-subscribe' && message.path.includes('search_page')) state.searchSubscribed = true;
          } catch {}
        });
      });
      for (const route of ['/en', '/en/shop', `/en/shop/product/${product.id}`, '/en/cart', '/en/search', '/en/shop']) {
        const start = performance.now();
        const response = await page.goto(`${baseURL}${route}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
        if (response.status() !== 200) throw new Error(`Dev route ${route} failed.`);
        await page.locator('main h1:visible').first().waitFor();
        result.routes.push({ route, usefulUiMs: performance.now() - start });
        save();
      }
      await page.goto(`${baseURL}/en`); await page.locator('main h1:visible').first().waitFor();
      for (const route of ['/en/shop', `/en/shop/product/${product.id}`]) {
        const link = page.locator(`a[href="${route}"]`).filter({ visible: true }).first();
        await link.waitFor();
        const start = performance.now();
        await link.click(); await page.waitForURL(`${baseURL}${route}`); await page.locator('main h1:visible').first().waitFor();
        result.spaRoutes.push({ route, usefulUiMs: performance.now() - start }); save();
      }
      await page.goto(`${baseURL}/en/search`); await page.locator('main h1:visible').first().waitFor();
      const subscriptionStarted = performance.now();
      while (!hmr.searchSubscribed && performance.now() - subscriptionStarted < 15000) await wait(50);
      if (!hmr.searchSubscribed) throw new Error('Search HMR subscription did not connect; no component-edit timing is valid.');
      for (let edit = 1; edit <= 5; edit++) {
        const current = fs.readFileSync(source, 'utf8').replace(attribute, '');
        if (current.split(section).length !== 2) throw new Error('Search changed during the probe; no unrelated source was replaced.');
        const start = performance.now();
        fs.writeFileSync(source, current.replace(section, `${section} data-model-universe-hmr-probe="${edit}"`));
        await page.locator(`[data-model-universe-hmr-probe="${edit}"]`).waitFor({ timeout: 30000 });
        result.hmrMs.push(performance.now() - start);
        save();
      }
    } finally {
      const current = fs.readFileSync(source, 'utf8');
      const clean = current.replace(attribute, '');
      if (clean !== current) fs.writeFileSync(source, clean);
      if (browser) await browser.close();
      stop(child);
    }
  }
  } catch (error) { result.failure = error.message; save(); throw error; }
  result.completed = true; save();
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
