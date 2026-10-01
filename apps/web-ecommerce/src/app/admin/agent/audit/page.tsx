import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import Audit from '@/core/client/features/agent-console/pages/Audit';

export const metadata: Metadata = {
  title: 'Nhật ký tác tử - Quản trị Clothing Shop',
};

const AuditPage = () => {
  return (
    <DefaultLayout>
      <Audit />
    </DefaultLayout>
  );
};

export default AuditPage;
