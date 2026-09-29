import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import ImprovementInbox from '@/core/client/features/ci-console/pages/ImprovementInbox';

export const metadata: Metadata = {
  title: 'Đề xuất cải tiến - Quản trị Clothing Shop',
};

const ImprovementInboxPage = () => {
  return (
    <DefaultLayout>
      <ImprovementInbox />
    </DefaultLayout>
  );
};

export default ImprovementInboxPage;
