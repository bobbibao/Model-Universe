import { Metadata } from 'next';
import AgentTaskList from '@/core/client/features/agent-console/pages/AgentTaskList';

export const metadata: Metadata = {
  title: 'Công việc từ Agent - Quản trị Clothing Shop',
};

const TasksPage = () => {
  return (
    <AgentTaskList />
  );
};

export default TasksPage;
