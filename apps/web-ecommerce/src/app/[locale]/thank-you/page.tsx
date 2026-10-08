import { Suspense } from 'react';
import { Metadata } from 'next';
import StoreLayout from '@/components/Layouts/StoreLayout';
import ThankYou from '@/core/client/features/cart/pages/ThankYou';

export const metadata: Metadata = {
  title: 'Đặt hàng thành công - Model Universe',
};

const ThankYouPage = () => {
  return (
    <StoreLayout>
      <Suspense>
        <ThankYou />
      </Suspense>
    </StoreLayout>
  );
};

export default ThankYouPage;
