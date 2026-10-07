import { Metadata } from 'next';
import SupplierList from '@/core/client/features/supplier-management/pages/SupplierList';

export const metadata: Metadata = {
  title: 'Nhà cung cấp - Quản trị Clothing Shop',
};

const SupplierListPage = () => {
  return (
    <SupplierList />
  );
};

export default SupplierListPage;
