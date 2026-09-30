import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import Inbox from '@/core/client/features/agent-console/pages/Inbox';

export const metadata: Metadata = {
  title: 'Hoạt động của tác tử - Quản trị Clothing Shop',
};

const ActivityPage = () => {
  return (
    <DefaultLayout>
      <Inbox initialTab="all" pageName="Hoạt động của tác tử" />
    </DefaultLayout>
  );
};

export default ActivityPage;
