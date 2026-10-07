import { Metadata } from 'next';
import CouponList from '@/core/client/features/coupon-management/pages/CouponList';

export const metadata: Metadata = {
  title: 'Khuyến mãi - Quản trị Clothing Shop',
};

const CouponListPage = () => {
  return (
    <CouponList />
  );
};

export default CouponListPage;
