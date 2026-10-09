import { Metadata } from 'next';
import Impact from '@/core/client/features/agent-console/pages/Impact';

export const metadata: Metadata = {
  title: 'Hiệu quả cải tiến - Quản trị Model Universe',
};

const ImpactPage = () => {
  return (
    <Impact />
  );
};

export default ImpactPage;
