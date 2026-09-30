import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import ReturnList from '@/core/client/features/return-management/pages/ReturnList';

export const metadata: Metadata = {
  title: 'Trả hàng - Quản trị Clothing Shop',
};

const ReturnListPage = () => {
  return (
    <DefaultLayout>
      <ReturnList />
    </DefaultLayout>
  );
};

export default ReturnListPage;
