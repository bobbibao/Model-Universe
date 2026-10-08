import { Metadata } from 'next';
import StoreLayout from '@/components/Layouts/StoreLayout';
import ProductDetail from '@/core/client/features/shop/pages/ProductDetail';

export const metadata: Metadata = {
  title: 'Chi tiết sản phẩm - Model Universe',
};

const ProductDetailPage = () => {
  return (
    <StoreLayout>
      <ProductDetail />
    </StoreLayout>
  );
};

export default ProductDetailPage;
