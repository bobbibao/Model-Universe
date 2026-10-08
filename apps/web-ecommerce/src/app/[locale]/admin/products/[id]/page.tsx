import { Metadata } from 'next';
import ProductEdit from '@/core/client/features/product-management/pages/ProductEdit';

export const metadata: Metadata = {
  title: 'Chỉnh sửa sản phẩm - Quản trị Model Universe',
};

const ProductEditPage = () => {
  return (
    <ProductEdit />
  );
};

export default ProductEditPage;
