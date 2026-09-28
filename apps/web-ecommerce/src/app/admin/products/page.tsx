import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import ProductList from '@/core/client/features/product-management/pages/ProductList';

export const metadata: Metadata = {
  title: 'Sản phẩm - Quản trị Clothing Shop',
};

const ProductListPage = () => {
  return (
    <DefaultLayout>
      <ProductList />
    </DefaultLayout>
  );
};

export default ProductListPage;
