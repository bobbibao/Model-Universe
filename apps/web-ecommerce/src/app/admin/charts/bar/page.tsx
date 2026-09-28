import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import BarCharts from '@/core/client/features/charts/pages/BarCharts';

export const metadata: Metadata = {
  title: 'Biểu đồ cột - Quản trị Clothing Shop',
};

const BarChartsPage = () => {
  return (
    <DefaultLayout>
      <BarCharts />
    </DefaultLayout>
  );
};

export default BarChartsPage;
