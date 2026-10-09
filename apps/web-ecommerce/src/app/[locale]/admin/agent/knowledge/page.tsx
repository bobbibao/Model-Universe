import { Metadata } from 'next';
import Knowledge from '@/core/client/features/agent-console/pages/Knowledge';

export const metadata: Metadata = {
  title: 'Tri thức của Agent - Quản trị Model Universe',
};

const KnowledgePage = () => {
  return (
    <Knowledge />
  );
};

export default KnowledgePage;
