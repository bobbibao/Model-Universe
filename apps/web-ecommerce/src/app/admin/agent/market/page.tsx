import { Metadata } from 'next';
import Market from '@/core/client/features/agent-console/pages/Market';

export const metadata: Metadata = {
  title: 'Dữ liệu thị trường - Quản trị Clothing Shop',
};

const MarketPage = () => {
  return (
    <Market />
  );
};

export default MarketPage;
