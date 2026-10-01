import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import Campaigns from '@/core/client/features/agent-console/pages/Campaigns';

export const metadata: Metadata = {
  title: 'Chiến dịch của tác tử - Quản trị Clothing Shop',
};

const CampaignsPage = () => {
  return (
    <DefaultLayout>
      <Campaigns />
    </DefaultLayout>
  );
};

export default CampaignsPage;
