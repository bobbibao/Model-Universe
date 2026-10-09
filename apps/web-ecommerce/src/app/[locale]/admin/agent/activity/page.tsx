import { Metadata } from 'next';
import Inbox from '@/core/client/features/agent-console/pages/Inbox';

export const metadata: Metadata = {
  title: 'Hoạt động của Agent - Quản trị Model Universe',
};

const ActivityPage = () => {
  return (
    <Inbox initialTab="all" pageName="Hoạt động của Agent" />
  );
};

export default ActivityPage;
