import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import KpiImpact from '@/core/client/features/ci-console/pages/KpiImpact';

export const metadata: Metadata = {
  title: 'Hiệu quả cải tiến - Quản trị Clothing Shop',
};

const KpiImpactPage = () => {
  return (
    <DefaultLayout>
      <KpiImpact />
    </DefaultLayout>
  );
};

export default KpiImpactPage;
