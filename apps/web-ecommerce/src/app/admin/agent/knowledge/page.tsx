import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import Knowledge from '@/core/client/features/agent-console/pages/Knowledge';

export const metadata: Metadata = {
  title: 'Tri thức của tác tử - Quản trị Clothing Shop',
};

const KnowledgePage = () => {
  return (
    <DefaultLayout>
      <Knowledge />
    </DefaultLayout>
  );
};

export default KnowledgePage;
