import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/config';
import type { ReactNode } from 'react';
export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  if (!isLocale((await params).locale)) notFound();
  return children;
}
