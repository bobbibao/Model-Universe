import '@/css/satoshi.css';
import '@/css/style.css';
import 'react-toastify/dist/ReactToastify.css';
import '@/css/customer-assistant.css';
import '@/css/model-universe.css';
import '@/css/admin-workspace.css';
import '@/css/collector-studio.css';
import '@/css/catalog-controls.css';
import '@/css/workspace-controls.css';
import '@/css/commerce-workspace.css';
import '@/css/store-workspaces.css';
import '@/css/checkout-payment.css';
import '@/css/promotions.css';
import { getLocale, getMessages } from 'next-intl/server';
import { NextIntlClientProvider } from 'next-intl';
import AppProviders from '@/components/AppProviders';
import type { ReactNode } from 'react';
export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    // Browser extensions (password managers, translators, assistants) add attributes to <html> and <body> before React
    // hydrates; suppressHydrationWarning ignores attribute differences on these two elements only, not their children.
    // data-scroll-behavior keeps the smooth scrolling from style.css while Next.js routes (Next 15 contract).
    <html lang={locale} suppressHydrationWarning data-scroll-behavior="smooth">
      <body id="workspace-page" suppressHydrationWarning>
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Ho_Chi_Minh">
          <AppProviders>{children}</AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
