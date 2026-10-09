import { Metadata } from 'next';
import ThreadDetail from '@/core/client/features/agent-console/pages/ThreadDetail';

export const metadata: Metadata = {
  title: 'Đề xuất của Agent - Quản trị Model Universe',
};

const ThreadDetailPage = () => {
  return (
    <ThreadDetail />
  );
};

export default ThreadDetailPage;
