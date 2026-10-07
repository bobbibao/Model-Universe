import { Metadata } from 'next';
import OrderList from '@/core/client/features/order-management/pages/OrderList';

export const metadata: Metadata = {
  title: 'Đơn hàng - Quản trị Clothing Shop',
};

const OrderListPage = () => {
  return (
    <OrderList />
  );
};

export default OrderListPage;
