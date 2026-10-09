import { Metadata } from 'next';
import PieCharts from '@/core/client/features/charts/pages/PieCharts';

export const metadata: Metadata = {
  title: 'Biểu đồ tròn - Quản trị Model Universe',
};

const PieChartsPage = () => {
  return (
    <PieCharts />
  );
};

export default PieChartsPage;
