import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import Dashboard from '@/core/client/features/dashboard/pages/Dashboard';

export const metadata: Metadata = {
  title: 'Dashboard - Quản trị Clothing Shop',
};

const DashboardPage = () => {
  return (
    <DefaultLayout>
      <Dashboard />
    </DefaultLayout>
  );
};

export default DashboardPage;
