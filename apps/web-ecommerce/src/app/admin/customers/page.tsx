import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import CustomerList from '@/core/client/features/customer-management/pages/CustomerList';

export const metadata: Metadata = {
  title: 'Khách hàng - Quản trị Clothing Shop',
};

const CustomersPage = () => {
  return (
    <DefaultLayout>
      <CustomerList />
    </DefaultLayout>
  );
};

export default CustomersPage;
