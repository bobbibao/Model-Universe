import { test, expect } from '@playwright/test';

for (const locale of ['vi', 'en'])
  for (const width of [320, 390, 1024, 1440]) {
    test(`${locale} ${width}: compact header, flat photos and standard assistant`, async ({ page }) => {
      test.setTimeout(120_000);
      const en = locale === 'en';
      await page.setViewportSize({ width, height: 900 });
      let chat: any;
      const product = {
        id: 1,
        name: 'Gundam collector kit',
        slug: 'gundam-collector-kit',
        sku: 'KIT-1',
        brandName: 'Bandai',
        imageUrl: '/images/catalog/gundam-unicorn.webp',
        price: 1_000_000,
        salePrice: 850_000,
        discountPercent: 15,
        stock: 3,
        grade: 'MG',
        condition: 'new',
        rating: 0,
        reviewCount: 0,
        salesChannel: 'web',
      };
      await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        let data: unknown = [];
        if (path === '/api/auth/me') data = { user: null };
        if (path === '/api/sales')
          data = {
            events: [
              {
                id: 1,
                title: en ? 'Weekend model picks' : 'Ưu đãi kit cuối tuần',
                maximumPercent: 15,
                endsAt: new Date(Date.now() + 86400_000).toISOString(),
                products: [product],
              },
            ],
          };
        if (path === '/api/assistant/chat') {
          chat = route.request().postDataJSON();
          data = {
            answer: en ? 'Tell me your budget.' : 'Bạn muốn tìm kit trong ngân sách nào?',
            products: [],
            sources: [],
            actions: [],
            research: false,
          };
        }
        await route.fulfill({ json: { statusCode: 200, data, userMessages: [] } });
      });
      await page.goto(`/${locale}/uu-dai`);
      const header = page.locator('.store-header');
      await expect(header).toBeVisible();
      expect((await header.boundingBox())!.height).toBeLessThanOrEqual(65);
      await expect(page.locator('a[href$="/compare"]')).toHaveCount(0);
      await expect(page.locator('.product-stage.has-depth, .product-stage-floor')).toHaveCount(0);
      await expect(page.locator('.product-stage-photo')).toHaveCount(1);
      const photo = page.locator('.product-stage-photo');
      await photo.hover();
      expect(await photo.evaluate((e) => getComputedStyle(e).transform)).toBe('none');
      expect(await page.locator('.product-stage').evaluate((e) => getComputedStyle(e).perspective)).toBe('none');
      if (width <= 640) await expect(page.locator('.agent-launcher')).toBeHidden();
      const menu = page.locator('.store-menu-button');
      if (width < 1024) {
        await menu.click();
        await expect(page.locator('#store-mobile-menu')).toBeVisible();
        expect((await header.boundingBox())!.height).toBeLessThanOrEqual(65);
        await page.keyboard.press('Escape');
        await expect(page.locator('#store-mobile-menu')).toHaveCount(0);
        await expect(menu).toBeFocused();
        await menu.click();
        await page.locator('.sale-member-strip').click({ position: { x: 8, y: 8 } });
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect(page.locator('#store-mobile-menu')).toHaveCount(0);
      } else {
        await expect(menu).toBeHidden();
        await expect(page.locator('.store-primary-nav')).toBeVisible();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `e2e/.results/store-header-${locale}-${width}.png`, fullPage: false });
      await page.goto(`/${locale}/assistant`);
      await expect(
        page.getByRole('checkbox', { name: en ? 'Detailed research' : 'Nghiên cứu chuyên sâu' }),
      ).toHaveCount(0);
      await expect(page.locator('.agent-starters button')).toHaveCount(3);
      await page
        .getByRole('textbox', { name: en ? 'Message the assistant' : 'Tin nhắn cho trợ lý' })
        .fill(en ? 'Help me choose a kit' : 'Tư vấn kit cho tôi');
      await page.locator('.agent-input-wrap button[type=submit]').click();
      await expect.poll(() => chat?.message).toBe(en ? 'Help me choose a kit' : 'Tư vấn kit cho tôi');
      expect(chat.research).not.toBe(true);
      await expect(
        page.getByText(en ? 'Tell me your budget.' : 'Bạn muốn tìm kit trong ngân sách nào?', { exact: true }),
      ).toBeVisible();
      const retired = await page.goto(`/${locale}/compare`);
      expect(retired?.status()).toBe(404);
    });
  }
