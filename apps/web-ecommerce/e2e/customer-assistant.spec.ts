import { expect, test, type Page } from '@playwright/test';

const product = {
  id: 3,
  name: 'Giày đi bộ thử nghiệm',
  sku: 'TEST-3',
  brandName: 'Shop',
  gender: 'unisex',
  price: 1000000,
  salePrice: 600000,
  discountPercent: 40,
  discountEndsAt: null,
  stock: 5,
  imageUrl: '/images/store/hero.jpg',
  images: [],
  availableSizes: ['M', 'L'],
  rating: 4.5,
  reviewCount: 0,
  ratingDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
  sold: 10,
  isFeatured: true,
  salesChannel: 'web',
  categoryId: 1,
  description: 'Sản phẩm dùng cho kiểm tra giao diện.',
};
const user = {
  id: 7,
  email: 'customer@example.test',
  firstName: 'Lan',
  lastName: 'Nguyễn',
  role: 'USER',
  isActive: true,
  phone: '0901234567',
  address: '12 Đường A',
};

// Isolated browser checks: every API call is mocked, so this spec never posts reviews, contacts or real orders.
async function mockShop(page: Page, signedIn = false) {
  const state = {
    contacts: 0,
    reviews: 0,
    orders: 0,
    price: 600000,
    lastContact: null as Record<string, unknown> | null,
    lastOrder: null as Record<string, unknown> | null,
  };
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON() || {};
    let data: unknown = null;
    if (path === '/api/auth/me') data = { user: signedIn ? user : null };
    else if (path === '/api/products/3') data = product;
    else if (path === '/api/products/3/reviews')
      data = { payload: { data: [], pagination: { page: 1, hasNextPage: false } } };
    else if (path === '/api/products')
      data = { payload: { data: [product], pagination: { page: 1, hasNextPage: false } } };
    else if (path === '/api/cart/quote') {
      const lines = (body.items || []).map((item: { productId: number; size: string; quantity: number }) => ({
        ...item,
        status: 'OK',
        availableStock: 5,
        lineTotal: state.price * item.quantity,
        product: { ...product, salePrice: state.price },
      }));
      const subtotal = lines.reduce((sum: number, line: { lineTotal: number }) => sum + line.lineTotal, 0);
      data = {
        lines,
        subtotal,
        discount: body.couponCode ? 100000 : 0,
        total: subtotal - (body.couponCode ? 100000 : 0),
        couponCode: body.couponCode || null,
        itemCount: lines.reduce((sum: number, line: { quantity: number }) => sum + line.quantity, 0),
        hasIssues: false,
      };
    } else if (path.startsWith('/api/coupons/'))
      data = {
        code: 'AGENT30',
        title: 'Mã thử nghiệm',
        discountPercent: 30,
        minOrderVnd: 0,
        expirationDate: '2099-01-01',
      };
    else if (path === '/api/reviews/eligibility/3') data = { canReview: true };
    else if (path === '/api/contact') {
      state.contacts++;
      state.lastContact = body;
    } else if (path === '/api/reviews') {
      state.reviews++;
    } else if (path === '/api/orders' && route.request().method() === 'POST') {
      state.orders++;
      state.lastOrder = body;
      data = { id: 99, total: body.expectedTotal ?? state.price, ...body };
    } else if (path === '/api/assistant/chat') {
      let actions: unknown[] = [];
      if (String(body.message).includes('liên hệ'))
        actions = [{ kind: 'contact', message: 'Tôi muốn hỏi về thời gian giao hàng.' }];
      else if (String(body.message).includes('đánh giá'))
        actions = [
          {
            kind: 'review',
            productId: 3,
            product,
            title: 'Giày phù hợp',
            content: 'Tôi đã đi bộ và cảm thấy thoải mái.',
          },
        ];
      else if (String(body.message).includes('thanh toán')) actions = [{ kind: 'checkout' }];
      else if (String(body.message).includes('mã')) actions = [{ kind: 'apply_coupon', code: 'AGENT30' }];
      else actions = [{ kind: 'cart_add', productId: 3, product, quantity: 1 }];
      data = {
        answer: 'Mình đã tìm thấy sản phẩm phù hợp. Bạn có thể kiểm tra và chọn thao tác bên dưới.',
        products: [product],
        sources: [{ label: product.name, path: '/shop/product/3' }],
        actions,
        research: body.research,
      };
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ statusCode: 200, data, userMessages: [] }),
    });
  });
  return state;
}

test('guest finds products, selects a size and keeps chat while navigating', async ({ page }) => {
  await mockShop(page);
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Bạn muốn Agent giúp gì?' }).fill('Tìm giày đi bộ');
  await page.getByRole('button', { name: 'Hỏi Agent', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Agent', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Mình đã tìm thấy sản phẩm phù hợp.', { exact: false })).toBeVisible();
  await test.info().attach('customer-agent-desktop', { body: await page.screenshot(), contentType: 'image/png' });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cart') || '[]').length)).toBe(0);
  await dialog.locator('.agent-action').getByLabel('Kích thước').selectOption('M');
  await dialog.locator('.agent-action').getByRole('button', { name: 'Thêm vào giỏ', exact: true }).click();
  await expect(dialog.getByText('Đã thêm 1 Giày đi bộ thử nghiệm vào giỏ.')).toBeVisible();
  await dialog.locator('.agent-product-link').first().click();
  await expect(page).toHaveURL(/\/shop\/product\/3/);
  await expect(dialog.getByText('Đã thêm 1 Giày đi bộ thử nghiệm vào giỏ.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Thu gọn Agent' }).click();
  await page.getByRole('button', { name: 'Mở Agent hỗ trợ mua sắm' }).click();
  await expect(dialog.getByText('Tìm giày đi bộ', { exact: true })).toBeVisible();
});

test('coupon checkout uses the server total and preserves the applied coupon', async ({ page }) => {
  const state = await mockShop(page, true);
  await page.addInitScript(
    (p) =>
      localStorage.setItem(
        'cart',
        JSON.stringify([
          {
            productId: p.id,
            name: p.name,
            imageUrl: p.imageUrl,
            brandName: p.brandName,
            price: p.salePrice,
            quantity: 1,
            size: 'M',
          },
        ]),
      ),
    product,
  );
  await page.goto('/assistant');
  await page.getByRole('textbox', { name: 'Tin nhắn cho Agent' }).fill('Áp dụng mã AGENT30');
  await page.getByRole('button', { name: 'Gửi tin nhắn' }).click();
  await page.locator('.agent-action').getByRole('button', { name: 'Áp dụng mã giảm giá', exact: true }).click();
  await expect(page.getByText('Đã áp dụng mã AGENT30.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Tin nhắn cho Agent' }).fill('Giúp tôi thanh toán');
  await page.getByRole('button', { name: 'Gửi tin nhắn' }).click();
  const action = page.locator('.agent-action');
  await action.getByLabel('Tỉnh/Thành phố').fill('Hồ Chí Minh');
  await action.getByRole('button', { name: 'Kiểm tra giỏ và tổng tiền' }).click();
  await expect(action.getByRole('button', { name: /Xác nhận đặt hàng.*500\.000/ })).toBeVisible();
  await action.getByRole('button', { name: /Xác nhận đặt hàng/ }).click();
  await expect.poll(() => state.orders).toBe(1);
  expect(state.lastOrder).toMatchObject({ expectedTotal: 500000, couponCode: 'AGENT30' });
});

test('mobile assistant is usable and contact draft stays editable until approval', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await mockShop(page);
  await page.goto('/assistant');
  await expect(page.getByRole('heading', { name: 'Một người bạn. Nhiều cách giúp.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('textbox', { name: 'Tin nhắn cho Agent' }).fill('Soạn liên hệ cửa hàng');
  await page.getByRole('button', { name: 'Gửi tin nhắn' }).click();
  const action = page.locator('.agent-action');
  await expect(action.getByLabel('Nội dung gửi cửa hàng')).toBeVisible();
  expect(state.contacts).toBe(0);
  await action.getByLabel('Họ tên', { exact: true }).fill('Lan');
  await action.getByLabel('Email phản hồi').fill('lan@example.test');
  await action.getByLabel('Nội dung gửi cửa hàng').fill('Nội dung tôi đã sửa.');
  await test.info().attach('customer-agent-mobile', { body: await page.screenshot(), contentType: 'image/png' });
  await action.getByRole('button', { name: 'Gửi liên hệ' }).click();
  await expect(page.getByText('Đã gửi tin nhắn cho cửa hàng.')).toBeVisible();
  expect(state.contacts).toBe(1);
  expect(state.lastContact?.message).toBe('Nội dung tôi đã sửa.');
});

test('review requires the customer rating and confirmation of real experience', async ({ page }) => {
  const state = await mockShop(page, true);
  await page.goto('/assistant');
  await page.getByRole('textbox', { name: 'Tin nhắn cho Agent' }).fill('Soạn đánh giá từ trải nghiệm thật của tôi');
  await page.getByRole('button', { name: 'Gửi tin nhắn' }).click();
  const action = page.locator('.agent-action');
  await expect(action.getByLabel('Đánh giá của bạn')).toBeVisible();
  await action.getByRole('button', { name: 'Đăng đánh giá' }).click();
  expect(state.reviews).toBe(0);
  await action.getByLabel('Đánh giá của bạn').selectOption('4');
  await action.getByLabel('Nội dung phản ánh trải nghiệm thực tế của tôi.').check();
  await action.getByRole('button', { name: 'Đăng đánh giá' }).click();
  await expect(page.getByText('Đã đăng đánh giá của bạn.')).toBeVisible();
  expect(state.reviews).toBe(1);
});

test('checkout needs a fresh quote and a second confirmation when prices change', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const state = await mockShop(page, true);
  await page.addInitScript(
    (p) =>
      localStorage.setItem(
        'cart',
        JSON.stringify([
          {
            productId: p.id,
            name: p.name,
            imageUrl: p.imageUrl,
            brandName: p.brandName,
            price: p.salePrice,
            quantity: 1,
            size: 'M',
          },
        ]),
      ),
    product,
  );
  await page.goto('/assistant');
  await page.getByRole('textbox', { name: 'Tin nhắn cho Agent' }).fill('Giúp tôi thanh toán');
  await page.getByRole('button', { name: 'Gửi tin nhắn' }).click();
  const action = page.locator('.agent-action');
  await action.getByLabel('Tỉnh/Thành phố').fill('Hồ Chí Minh');
  await action.getByRole('button', { name: 'Kiểm tra giỏ và tổng tiền' }).click();
  await expect(action.getByRole('button', { name: /Xác nhận đặt hàng/ })).toBeVisible();
  expect(state.orders).toBe(0);
  state.price = 650000;
  await action.getByRole('button', { name: /Xác nhận đặt hàng/ }).click();
  await expect(action.getByText('Giá hoặc thông tin sản phẩm đã thay đổi.', { exact: false })).toBeVisible();
  expect(state.orders).toBe(0);
  await action.getByRole('button', { name: /Xác nhận đặt hàng/ }).click();
  await expect.poll(() => state.orders).toBe(1);
  expect(errors).toEqual([]);
});

test('narrow phones keep the signed-in header and full-screen assistant accessible', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await mockShop(page, true);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Tài khoản', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('header').getByRole('button', { name: 'Hỏi Agent', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Agent', exact: true });
  await expect(dialog.getByRole('textbox', { name: 'Tin nhắn cho Agent' })).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds?.width).toBe(320);
  expect(bounds?.height).toBe(720);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
