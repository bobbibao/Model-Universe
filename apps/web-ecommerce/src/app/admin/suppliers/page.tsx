import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import SupplierList from '@/core/client/features/supplier-management/pages/SupplierList';

export const metadata: Metadata = {
  title: 'Nhà cung cấp - Quản trị Clothing Shop',
};

const SupplierListPage = () => {
  return (
    <DefaultLayout>
      <SupplierList />
    </DefaultLayout>
  );
};

export default SupplierListPage;
