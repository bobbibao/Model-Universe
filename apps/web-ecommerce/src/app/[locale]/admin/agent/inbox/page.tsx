import { Metadata } from 'next';
import Inbox from '@/core/client/features/agent-console/pages/Inbox';

export const metadata: Metadata = {
  title: 'Hộp duyệt của Agent - Quản trị Model Universe',
};

const InboxPage = () => {
  return (
    <Inbox />
  );
};

export default InboxPage;
