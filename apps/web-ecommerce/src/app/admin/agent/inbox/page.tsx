import { Metadata } from 'next';
import Inbox from '@/core/client/features/agent-console/pages/Inbox';

export const metadata: Metadata = {
  title: 'Hộp duyệt của Agent - Quản trị Clothing Shop',
};

const InboxPage = () => {
  return (
    <Inbox />
  );
};

export default InboxPage;
