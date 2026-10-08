'use client';
import type { ReactNode } from 'react';
import ToastProvider from '@/shared/client/providers/ToastProvider';
import { CurrentUserProvider } from '@/shared/client/providers/CurrentUserProvider';
import { CartProvider } from '@/shared/client/providers/CartProvider';
import { CheckoutDraftProvider } from '@/shared/client/providers/CheckoutDraftProvider';
import { CustomerAssistantProvider } from '@/shared/client/providers/CustomerAssistantProvider';
import { ComparisonProvider } from '@/shared/client/providers/ComparisonProvider';
export default function AppProviders({ children }: { children: ReactNode }) {
  return <ToastProvider><CurrentUserProvider><ComparisonProvider><CartProvider><CheckoutDraftProvider><CustomerAssistantProvider>{children}</CustomerAssistantProvider></CheckoutDraftProvider></CartProvider></ComparisonProvider></CurrentUserProvider></ToastProvider>;
}
