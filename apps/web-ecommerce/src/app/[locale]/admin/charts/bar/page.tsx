import { Metadata } from 'next';
import BarCharts from '@/core/client/features/charts/pages/BarCharts';

export const metadata: Metadata = {
  title: 'Biểu đồ cột - Quản trị Model Universe',
};

const BarChartsPage = () => {
  return (
    <BarCharts />
  );
};

export default BarChartsPage;
