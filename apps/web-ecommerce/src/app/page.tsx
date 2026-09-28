import { Metadata } from 'next';
import StoreLayout from '@/components/Layouts/StoreLayout';
import Home from '@/core/client/features/home/pages/Home';

export const metadata: Metadata = {
  title: 'Trang chủ - Clothing Shop',
  description: 'Clothing Shop - cửa hàng quần áo, giày dép và phụ kiện.',
};

export default function HomePage() {
  return (
    <StoreLayout>
      <Home />
    </StoreLayout>
  );
}
