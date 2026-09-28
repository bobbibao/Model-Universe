import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import PieCharts from '@/core/client/features/charts/pages/PieCharts';

export const metadata: Metadata = {
  title: 'Biểu đồ tròn - Quản trị Clothing Shop',
};

const PieChartsPage = () => {
  return (
    <DefaultLayout>
      <PieCharts />
    </DefaultLayout>
  );
};

export default PieChartsPage;
