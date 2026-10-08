import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const artifactRoot = path.resolve('../../.artifacts/model-universe/visual');
async function preparePhotographs(page: import('@playwright/test').Page) {
  await page.locator('img').evaluateAll(images => images.forEach(image => { if (image instanceof HTMLImageElement) image.loading = 'eager'; }));
  await page.waitForFunction(() => Array.from(document.images).every(image => image.complete && image.naturalWidth > 0));
  await page.evaluate(() => document.fonts.ready);
}
for (const locale of ['vi','en']) {
  for (const device of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844}]) {
    test(`${locale} ${device.name}: home, catalog, model and reservations`, async ({ page, request }) => {
      test.setTimeout(180000);
      await page.setViewportSize(device);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      fs.mkdirSync(artifactRoot,{recursive:true});
      await page.goto(`/${locale}`);
      await expect(page.locator('html')).toHaveAttribute('lang',locale);
      await expect(page.getByRole('heading',{name:locale === 'en' ? /Small parts/ : /Chi tiết nhỏ/})).toBeVisible();
      await expect(page.getByRole('link',{name:'RG',exact:false}).first()).toBeVisible();
      await preparePhotographs(page);
      await page.screenshot({path:path.join(artifactRoot,`${locale}-${device.name}-home.png`),fullPage:true});
      const response = await request.get('/api/products?per_page=8');
      expect(response.ok()).toBeTruthy();
      const products = (await response.json()).payload.data;
      expect(products.length).toBeGreaterThan(0);
      await page.goto(`/${locale}/shop?grade=RG`);
      await expect(page.getByRole('heading',{name:locale === 'en' ? 'The collection' : 'Bộ sưu tập',exact:true})).toBeVisible();
      await expect(page.getByRole('link',{name:products.find((product: {grade:string}) => product.grade === 'RG').name,exact:true}).first()).toBeVisible();
      await preparePhotographs(page);
      await page.screenshot({path:path.join(artifactRoot,`${locale}-${device.name}-catalog.png`),fullPage:true});
      await page.goto(`/${locale}/shop/product/${products[0].id}`);
      await expect(page.getByRole('heading',{name:products[0].name,exact:true})).toBeVisible();
      await expect(page.getByRole('button',{name:locale === 'en' ? 'Add to bag' : 'Thêm vào giỏ hàng',exact:true})).toBeVisible();
      await preparePhotographs(page);
      await page.screenshot({path:path.join(artifactRoot,`${locale}-${device.name}-model.png`),fullPage:true});
      await page.goto(`/${locale}/reservations`);
      await expect(page.getByRole('heading',{name:locale === 'en' ? 'Keep your next build within reach.' : 'Giữ chỗ cho mô hình bạn yêu thích.',exact:true})).toBeVisible();
      await preparePhotographs(page);
      await page.screenshot({path:path.join(artifactRoot,`${locale}-${device.name}-reservations.png`),fullPage:true});
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      expect(errors).toEqual([]);
    });
  }
}
