import { Metadata } from 'next';
import LineCharts from '@/core/client/features/charts/pages/LineCharts';

export const metadata: Metadata = {
  title: 'Biểu đồ đường - Quản trị Clothing Shop',
};

const LineChartsPage = () => {
  return (
    <LineCharts />
  );
};

export default LineChartsPage;
