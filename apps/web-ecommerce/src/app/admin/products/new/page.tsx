import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import ProductCreate from '@/core/client/features/product-management/pages/ProductCreate';

export const metadata: Metadata = {
  title: 'Thêm sản phẩm - Quản trị Clothing Shop',
};

const ProductCreatePage = () => {
  return (
    <DefaultLayout>
      <ProductCreate />
    </DefaultLayout>
  );
};

export default ProductCreatePage;
