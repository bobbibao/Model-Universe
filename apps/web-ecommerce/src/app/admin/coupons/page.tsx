import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import CouponList from '@/core/client/features/coupon-management/pages/CouponList';

export const metadata: Metadata = {
  title: 'Khuyến mãi - Quản trị Clothing Shop',
};

const CouponListPage = () => {
  return (
    <DefaultLayout>
      <CouponList />
    </DefaultLayout>
  );
};

export default CouponListPage;
