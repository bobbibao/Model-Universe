import { Metadata } from 'next';
import ProductCreate from '@/core/client/features/product-management/pages/ProductCreate';

export const metadata: Metadata = {
  title: 'Thêm sản phẩm - Quản trị Clothing Shop',
};

const ProductCreatePage = () => {
  return (
    <ProductCreate />
  );
};

export default ProductCreatePage;
