import { type Page } from '@playwright/test';

// Accounts come from the environment only (never commit credentials). Use throwaway accounts in a verify database.
export const admin = { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD };
export const customer = { email: process.env.E2E_CUSTOMER_EMAIL, password: process.env.E2E_CUSTOMER_PASSWORD };

export const hasAdmin = Boolean(admin.email && admin.password);
export const hasCustomer = Boolean(customer.email && customer.password);
export const writesEnabled = process.env.E2E_ALLOW_WRITES === '1'; // approves/rejects: changes shop data

export const signIn = async (page: Page, account: { email?: string; password?: string }, redirect = '/') => {
  await page.context().clearCookies();
  await page.goto(`/auth/signin?redirect=${encodeURIComponent(redirect)}`);
  await page.getByRole('textbox', { name: 'Email' }).fill(account.email ?? '');
  await page.getByRole('textbox', { name: 'Mật khẩu' }).fill(account.password ?? '');
  await page.getByRole('button', { name: 'Đăng nhập' }).last().click();
};
