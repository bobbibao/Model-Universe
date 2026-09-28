import { Suspense } from 'react';
import { Metadata } from 'next';
import StoreLayout from '@/components/Layouts/StoreLayout';
import Shop from '@/core/client/features/shop/pages/Shop';

export const metadata: Metadata = {
  title: 'Sản phẩm - Clothing Shop',
};

const ShopPage = () => {
  return (
    <StoreLayout>
      <Suspense>
        <Shop />
      </Suspense>
    </StoreLayout>
  );
};

export default ShopPage;
