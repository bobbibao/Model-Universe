import { Metadata } from 'next';
import Copilot from '@/core/client/features/agent-console/pages/Copilot';

export const metadata: Metadata = {
  title: 'Trợ lý AI - Quản trị Model Universe',
};

const CopilotPage = () => {
  return (
    <Copilot />
  );
};

export default CopilotPage;
