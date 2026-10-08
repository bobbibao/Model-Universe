import { Suspense } from 'react';
import { Metadata } from 'next';
import StoreLayout from '@/components/Layouts/StoreLayout';
import SignIn from '@/core/client/features/auth/pages/SignIn';

export const metadata: Metadata = {
  title: 'Đăng nhập - Model Universe',
};

const SignInPage = () => {
  return (
    <StoreLayout>
      <Suspense>
        <SignIn />
      </Suspense>
    </StoreLayout>
  );
};

export default SignInPage;
