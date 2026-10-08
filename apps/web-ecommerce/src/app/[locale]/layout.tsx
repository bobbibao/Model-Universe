import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/config';
import type { ReactNode } from 'react';
export default function LocaleLayout({ children, params }: { children: ReactNode; params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  return children;
}
