import '@/css/satoshi.css';
import '@/css/style.css';
import 'react-toastify/dist/ReactToastify.css';
import '@/css/customer-assistant.css';
import '@/css/model-universe.css';
import { getLocale, getMessages } from 'next-intl/server';
import { NextIntlClientProvider } from 'next-intl';
import AppProviders from '@/components/AppProviders';
import type { ReactNode } from 'react';
export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return <html lang={locale}><body><NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Ho_Chi_Minh"><AppProviders>{children}</AppProviders></NextIntlClientProvider></body></html>;
}
