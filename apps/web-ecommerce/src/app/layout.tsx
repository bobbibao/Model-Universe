'use client';
import '@/css/satoshi.css';
import '@/css/style.css';
import 'react-toastify/dist/ReactToastify.css';

import React, { useEffect, useState } from 'react';

import Loader from '../components/common/Loader';
import ToastProvider from '../shared/client/providers/ToastProvider';
import { CurrentUserProvider } from '../shared/client/providers/CurrentUserProvider';
import { CartProvider } from '../shared/client/providers/CartProvider';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    setTimeout(() => setLoading(false), 500);
  }, []);

  return (
    <html lang="vi">
      <body suppressHydrationWarning={true}>
        <div className="dark:bg-boxdark-2 dark:text-bodydark">
          <ToastProvider>
            <CurrentUserProvider>
              <CartProvider>{loading ? <Loader /> : children}</CartProvider>
            </CurrentUserProvider>
          </ToastProvider>
        </div>
      </body>
    </html>
  );
}
