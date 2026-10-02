import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import Copilot from '@/core/client/features/agent-console/pages/Copilot';

export const metadata: Metadata = {
  title: 'Trợ lý AI - Quản trị Clothing Shop',
};

const CopilotPage = () => {
  return (
    <DefaultLayout>
      <Copilot />
    </DefaultLayout>
  );
};

export default CopilotPage;
