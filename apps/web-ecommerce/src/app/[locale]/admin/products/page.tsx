import { Metadata } from 'next';
import ProductList from '@/core/client/features/product-management/pages/ProductList';

export const metadata: Metadata = {
  title: 'Sản phẩm - Quản trị Model Universe',
};

const ProductListPage = () => {
  return (
    <ProductList />
  );
};

export default ProductListPage;
