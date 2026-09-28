import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import OrderList from '@/core/client/features/order-management/pages/OrderList';

export const metadata: Metadata = {
  title: 'Đơn hàng - Quản trị Clothing Shop',
};

const OrderListPage = () => {
  return (
    <DefaultLayout>
      <OrderList />
    </DefaultLayout>
  );
};

export default OrderListPage;
