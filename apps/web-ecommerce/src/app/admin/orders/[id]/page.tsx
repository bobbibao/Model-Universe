import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import OrderDetail from '@/core/client/features/order-management/pages/OrderDetail';

export const metadata: Metadata = {
  title: 'Chi tiết đơn hàng - Quản trị Clothing Shop',
};

const OrderDetailPage = () => {
  return (
    <DefaultLayout>
      <OrderDetail />
    </DefaultLayout>
  );
};

export default OrderDetailPage;
