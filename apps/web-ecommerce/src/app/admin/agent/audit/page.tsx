import { Metadata } from 'next';
import Audit from '@/core/client/features/agent-console/pages/Audit';

export const metadata: Metadata = {
  title: 'Nhật ký Agent - Quản trị Clothing Shop',
};

const AuditPage = () => {
  return (
    <Audit />
  );
};

export default AuditPage;
