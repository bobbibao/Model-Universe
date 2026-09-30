import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import ImprovementDetail from '@/core/client/features/ci-console/pages/ImprovementDetail';

export const metadata: Metadata = {
  title: 'Chi tiết đề xuất cải tiến - Quản trị Clothing Shop',
};

const ImprovementDetailPage = () => {
  return (
    <DefaultLayout>
      <ImprovementDetail />
    </DefaultLayout>
  );
};

export default ImprovementDetailPage;
