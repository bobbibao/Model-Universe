import { Metadata } from 'next';
import StoreLayout from '@/components/Layouts/StoreLayout';
import OrderHistory from '@/core/client/features/account/pages/OrderHistory';

export const metadata: Metadata = {
  title: 'Lịch sử đơn hàng - Model Universe',
};

const OrderHistoryPage = () => {
  return (
    <StoreLayout>
      <OrderHistory />
    </StoreLayout>
  );
};

export default OrderHistoryPage;
