import { Suspense } from 'react';
import { Metadata } from 'next';
import StoreLayout from '@/components/Layouts/StoreLayout';
import Search from '@/core/client/features/shop/pages/Search';

export const metadata: Metadata = {
  title: 'Tìm kiếm - Clothing Shop',
};

const SearchPage = () => {
  return (
    <StoreLayout>
      <Suspense>
        <Search />
      </Suspense>
    </StoreLayout>
  );
};

export default SearchPage;
