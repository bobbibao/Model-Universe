import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import Growth from '@/core/client/features/agent-console/pages/Growth';

export const metadata: Metadata = {
  title: 'Kết quả tăng trưởng - Quản trị Clothing Shop',
};

const GrowthPage = () => {
  return (
    <DefaultLayout>
      <Growth />
    </DefaultLayout>
  );
};

export default GrowthPage;
