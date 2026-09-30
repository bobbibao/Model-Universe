import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import ThreadDetail from '@/core/client/features/agent-console/pages/ThreadDetail';

export const metadata: Metadata = {
  title: 'Đề xuất của tác tử - Quản trị Clothing Shop',
};

const ThreadDetailPage = () => {
  return (
    <DefaultLayout>
      <ThreadDetail />
    </DefaultLayout>
  );
};

export default ThreadDetailPage;
