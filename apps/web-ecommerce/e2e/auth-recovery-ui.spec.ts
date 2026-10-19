import { test, expect } from '@playwright/test';

for (const locale of ['vi', 'en']) for (const mobile of [false, true]) {
  test(`auth recovery ${locale} ${mobile ? 'mobile' : 'desktop'}`, async ({ page }) => {
    test.setTimeout(120_000);
    const en = locale === 'en';
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    const requests: { path: string; body: any }[] = [];
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() === 'POST') requests.push({ path, body: route.request().postDataJSON() });
      const data = path === '/api/auth/providers' ? { google: true } : path === '/api/auth/me' ? { user: null } : [];
      await route.fulfill({ json: { statusCode: 200, data, userMessages: [], payload: { data: [], pagination: { total: 0 } } } });
    });
    await page.goto(`/${locale}/auth/signin`);
    await expect(page.getByRole('heading', { name: en ? 'Welcome back' : 'Chào mừng trở lại' })).toBeVisible();
    const google = page.getByRole('link', { name: en ? 'Continue with Google' : 'Tiếp tục với Google' });
    await expect(google).toHaveAttribute('href', /\/api\/auth\/google\?/);
    const password = page.getByLabel(en ? 'Password' : 'Mật khẩu', { exact: true });
    await password.fill('my-password');
    await page.getByRole('button', { name: en ? 'Show password' : 'Hiện mật khẩu', exact: true }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await page.getByLabel('Email', { exact: true }).fill('customer@example.com');
    await page.screenshot({ path: `e2e/.results/auth-${locale}-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true });
    await page.getByRole('link', { name: en ? 'Forgot password?' : 'Quên mật khẩu?' }).click();
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue('customer@example.com');
    await page.getByRole('button', { name: en ? 'Send reset link' : 'Gửi liên kết đặt lại', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: en ? 'Check your inbox' : 'Kiểm tra hộp thư' })).toBeVisible();
    await expect(page.getByRole('button', { name: /(?:Resend in|Gửi lại sau)/ })).toBeDisabled();
    expect(requests.find((r) => r.path === '/api/auth/forgot-password')?.body).toEqual({ email: 'customer@example.com', locale });

    const token = 'a'.repeat(64);
    await page.goto(`/${locale}/auth/reset-password#token=${token}`);
    await expect(page.getByLabel(en ? 'New password' : 'Mật khẩu mới', { exact: true })).toBeVisible();
    expect(new URL(page.url()).hash).toBe('');
    await page.getByLabel(en ? 'New password' : 'Mật khẩu mới', { exact: true }).fill('new-password');
    await page.getByLabel(en ? 'Confirm new password' : 'Nhập lại mật khẩu mới', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: en ? 'Save new password' : 'Lưu mật khẩu mới', exact: true }).click();
    await expect(page.getByText(en ? 'Passwords do not match.' : 'Mật khẩu nhập lại không khớp.', { exact: true })).toBeVisible();
    await page.getByLabel(en ? 'Confirm new password' : 'Nhập lại mật khẩu mới', { exact: true }).fill('new-password');
    await page.getByRole('button', { name: en ? 'Save new password' : 'Lưu mật khẩu mới', exact: true }).click();
    await expect(page.getByRole('heading', { name: en ? 'Password updated' : 'Đã đặt lại mật khẩu' })).toBeVisible();
    expect(requests.find((r) => r.path === '/api/auth/reset-password')?.body).toEqual({ token, password: 'new-password', confirmPassword: 'new-password' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
