import { Suspense } from 'react';
import type { Metadata } from 'next';
import StoreLayout from '@/components/Layouts/StoreLayout';
import ForgotPassword from '@/core/client/features/auth/pages/ForgotPassword';

export const metadata: Metadata = {
  title: 'Quên mật khẩu - Model Universe',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default function Page() {
  return (
    <StoreLayout>
      <Suspense>
        <ForgotPassword />
      </Suspense>
    </StoreLayout>
  );
}
