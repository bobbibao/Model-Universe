import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import ProductEdit from '@/core/client/features/product-management/pages/ProductEdit';

export const metadata: Metadata = {
  title: 'Chỉnh sửa sản phẩm - Quản trị Clothing Shop',
};

const ProductEditPage = () => {
  return (
    <DefaultLayout>
      <ProductEdit />
    </DefaultLayout>
  );
};

export default ProductEditPage;
