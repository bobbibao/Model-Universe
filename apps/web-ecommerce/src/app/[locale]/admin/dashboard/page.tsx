import { Metadata } from 'next';
import Dashboard from '@/core/client/features/dashboard/pages/Dashboard';

export const metadata: Metadata = {
  title: 'Dashboard - Quản trị Model Universe',
};

const DashboardPage = () => {
  return (
    <Dashboard />
  );
};

export default DashboardPage;
