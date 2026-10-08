import { Metadata } from 'next';
import OrderDetail from '@/core/client/features/order-management/pages/OrderDetail';

export const metadata: Metadata = {
  title: 'Chi tiết đơn hàng - Quản trị Model Universe',
};

const OrderDetailPage = () => {
  return (
    <OrderDetail />
  );
};

export default OrderDetailPage;
