import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import Inbox from '@/core/client/features/agent-console/pages/Inbox';

export const metadata: Metadata = {
  title: 'Hộp duyệt của tác tử - Quản trị Clothing Shop',
};

const InboxPage = () => {
  return (
    <DefaultLayout>
      <Inbox />
    </DefaultLayout>
  );
};

export default InboxPage;
