import { Metadata } from 'next';
import ReturnList from '@/core/client/features/return-management/pages/ReturnList';

export const metadata: Metadata = {
  title: 'Trả hàng - Quản trị Clothing Shop',
};

const ReturnListPage = () => {
  return (
    <ReturnList />
  );
};

export default ReturnListPage;
