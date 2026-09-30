import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import AgentTaskList from '@/core/client/features/agent-console/pages/AgentTaskList';

export const metadata: Metadata = {
  title: 'Công việc từ tác tử - Quản trị Clothing Shop',
};

const TasksPage = () => {
  return (
    <DefaultLayout>
      <AgentTaskList />
    </DefaultLayout>
  );
};

export default TasksPage;
