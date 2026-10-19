import { Suspense } from 'react';
import type { Metadata } from 'next';
import StoreLayout from '@/components/Layouts/StoreLayout';
import ResetPassword from '@/core/client/features/auth/pages/ResetPassword';

export const metadata: Metadata = {
  title: 'Đặt lại mật khẩu - Model Universe',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default function Page() {
  return (
    <StoreLayout>
      <Suspense>
        <ResetPassword />
      </Suspense>
    </StoreLayout>
  );
}
