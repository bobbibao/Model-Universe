'use client';

import { useCallback, useEffect, useState } from 'react';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import DataTable, { DataTableColumn } from '@/components/Tables/DataTable';
import { inputClassName } from '@/components/FormElements/TextField';
import AgentTasksApi, { AgentTaskListParams } from '@/core/client/api/AgentTasks';
import type { AgentTask, AgentTaskStatus } from '@/shared/types/agent';
import type { Pagination } from '@/shared/types/pagination';
import { formatDateTime, roleLabel } from '../components/agentLabels';

const PAGE_SIZE = 10;

const STATUS: Record<AgentTaskStatus, { label: string; className: string }> = {
  OPEN: { label: 'Cần làm', className: 'bg-warning/10 text-warning' },
  DONE: { label: 'Hoàn thành', className: 'bg-success/10 text-success' },
  CANCELLED: { label: 'Đã huỷ', className: 'bg-body/10 text-body' },
};

// Tasks the agent created for staff while acting on an approved improvement.
const AgentTaskList = () => {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [pagination, setPagination] = useState<Pagination>();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<AgentTaskListParams['status']>('OPEN');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await AgentTasksApi.getTasks({ status, page, per_page: PAGE_SIZE });
    setTasks(result?.data || []);
    setPagination(result?.pagination);
    setLoading(false);
  }, [status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const setTaskStatus = async (task: AgentTask, next: AgentTaskStatus) => {
    if (await AgentTasksApi.updateTaskStatus(task.id, next)) load();
  };

  const columns: DataTableColumn<AgentTask>[] = [
    {
      key: 'title',
      header: 'Công việc',
      className: 'min-w-[260px]',
      render: (task) => (
        <div>
          <p className="font-semibold">{task.title}</p>
          {task.description && <p className="text-sm text-body">{task.description}</p>}
        </div>
      ),
    },
    { key: 'assigneeRole', header: 'Bộ phận', render: (task) => roleLabel(task.assigneeRole) },
    { key: 'dueAt', header: 'Hạn', render: (task) => formatDateTime(task.dueAt) },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (task) => (
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS[task.status].className}`}>
          {STATUS[task.status].label}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (task) =>
        task.status === 'CANCELLED' ? null : (
          <div className="flex justify-end">
            <button
              onClick={() => setTaskStatus(task, task.status === 'OPEN' ? 'DONE' : 'OPEN')}
              className="font-medium text-brand-hover hover:underline"
            >
              {task.status === 'OPEN' ? 'Đánh dấu hoàn thành' : 'Mở lại'}
            </button>
          </div>
        ),
    },
  ];

  return (
    <>
      <Breadcrumb pageName="Công việc từ AI" />
      <DataTable
        title="Công việc do Agent tạo"
        actions={
          <select
            className={`${inputClassName} !py-2 sm:w-44`}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as AgentTaskListParams['status']);
              setPage(1);
            }}
          >
            <option value="OPEN">Cần làm</option>
            <option value="DONE">Hoàn thành</option>
            <option value="CANCELLED">Đã huỷ</option>
            <option value="">Tất cả</option>
          </select>
        }
        columns={columns}
        data={tasks}
        rowKey={(task) => task.id}
        loading={loading}
        emptyText="Không có công việc nào"
        pagination={pagination}
        onPageChange={setPage}
      />
    </>
  );
};

export default AgentTaskList;
