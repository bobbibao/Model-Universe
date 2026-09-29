import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import AgentTaskList from '@/core/client/features/ci-console/pages/AgentTaskList';

export const metadata: Metadata = {
  title: 'Công việc từ AI - Quản trị Clothing Shop',
};

const AgentTaskListPage = () => {
  return (
    <DefaultLayout>
      <AgentTaskList />
    </DefaultLayout>
  );
};

export default AgentTaskListPage;
