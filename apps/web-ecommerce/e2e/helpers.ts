import { type Page } from '@playwright/test';

// Accounts come from the environment only (never commit credentials). Use throwaway accounts in a verify database.
export const admin = { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD };
export const customer = { email: process.env.E2E_CUSTOMER_EMAIL, password: process.env.E2E_CUSTOMER_PASSWORD };

export const hasAdmin = Boolean(admin.email && admin.password);
export const hasCustomer = Boolean(customer.email && customer.password);
export const writesEnabled = process.env.E2E_ALLOW_WRITES === '1'; // approves/rejects: changes shop data

// Complete the visible intake steps; hidden panels retain their original FormData fields.
export const fillCollectibleIntake = async (
  page: Page,
  messages: { buyback: { asset: Record<string, string> }; experience: { continue: string } },
  fields: Record<string, string>,
) => {
  for (const key of ['name', 'modelCode', 'version', 'boxCondition']) {
    await page.getByLabel(messages.buyback.asset[key], { exact: true }).fill(fields[key]);
  }
  await page.getByRole('combobox', { name: messages.buyback.asset.assemblyState, exact: true }).selectOption('painted');
  await page.getByRole('button', { name: messages.experience.continue, exact: true }).click();
  for (const key of ['accessories', 'defects', 'repairHistory']) {
    await page.getByLabel(messages.buyback.asset[key], { exact: true }).fill(fields[key]);
  }
  await page.getByRole('button', { name: messages.experience.continue, exact: true }).click();
};

export const signIn = async (page: Page, account: { email?: string; password?: string }, redirect = '/') => {
  await page.context().clearCookies();
  await page.goto(`/auth/signin?redirect=${encodeURIComponent(redirect)}`);
  await page.getByRole('textbox', { name: 'Email' }).fill(account.email ?? '');
  await page.getByRole('textbox', { name: 'Mật khẩu' }).fill(account.password ?? '');
  await page.getByRole('button', { name: 'Đăng nhập' }).last().click();
};
