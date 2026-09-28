import { Metadata } from 'next';
import StoreLayout from '@/components/Layouts/StoreLayout';
import SignUp from '@/core/client/features/auth/pages/SignUp';

export const metadata: Metadata = {
  title: 'Đăng ký - Clothing Shop',
};

const SignUpPage = () => {
  return (
    <StoreLayout>
      <SignUp />
    </StoreLayout>
  );
};

export default SignUpPage;
