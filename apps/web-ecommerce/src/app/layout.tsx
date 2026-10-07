'use client';
import '@/css/satoshi.css';
import '@/css/style.css';
import 'react-toastify/dist/ReactToastify.css';
import '@/css/customer-assistant.css';

import React from 'react';
import ToastProvider from '../shared/client/providers/ToastProvider';
import { CurrentUserProvider } from '../shared/client/providers/CurrentUserProvider';
import { CartProvider } from '../shared/client/providers/CartProvider';
import { CheckoutDraftProvider } from '../shared/client/providers/CheckoutDraftProvider';
import { CustomerAssistantProvider } from '../shared/client/providers/CustomerAssistantProvider';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body suppressHydrationWarning={true}>
        <div className="dark:bg-boxdark-2 dark:text-bodydark">
          <ToastProvider>
            <CurrentUserProvider>
              <CartProvider>
                <CheckoutDraftProvider>
                  <CustomerAssistantProvider>{children}</CustomerAssistantProvider>
                </CheckoutDraftProvider>
              </CartProvider>
            </CurrentUserProvider>
          </ToastProvider>
        </div>
      </body>
    </html>
  );
}
