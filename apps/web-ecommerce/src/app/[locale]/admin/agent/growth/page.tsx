import { Metadata } from 'next';
import Growth from '@/core/client/features/agent-console/pages/Growth';

export const metadata: Metadata = {
  title: 'Kết quả tăng trưởng - Quản trị Model Universe',
};

const GrowthPage = () => {
  return (
    <Growth />
  );
};

export default GrowthPage;
