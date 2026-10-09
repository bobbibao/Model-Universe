import { Metadata } from 'next';
import CustomerList from '@/core/client/features/customer-management/pages/CustomerList';

export const metadata: Metadata = {
  title: 'Khách hàng - Quản trị Model Universe',
};

const CustomersPage = () => {
  return (
    <CustomerList />
  );
};

export default CustomersPage;
