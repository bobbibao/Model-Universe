import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import LineCharts from '@/core/client/features/charts/pages/LineCharts';

export const metadata: Metadata = {
  title: 'Biểu đồ đường - Quản trị Clothing Shop',
};

const LineChartsPage = () => {
  return (
    <DefaultLayout>
      <LineCharts />
    </DefaultLayout>
  );
};

export default LineChartsPage;
