import { Metadata } from 'next';
import Campaigns from '@/core/client/features/agent-console/pages/Campaigns';

export const metadata: Metadata = {
  title: 'Chiến dịch của Agent - Quản trị Model Universe',
};

const CampaignsPage = () => {
  return (
    <Campaigns />
  );
};

export default CampaignsPage;
