import { Metadata } from 'next';
import Dashboard from '@/core/client/features/dashboard/pages/Dashboard';

export const metadata: Metadata = {
  title: 'Dashboard - Quản trị Clothing Shop',
};

const DashboardPage = () => {
  return (
    <Dashboard />
  );
};

export default DashboardPage;
