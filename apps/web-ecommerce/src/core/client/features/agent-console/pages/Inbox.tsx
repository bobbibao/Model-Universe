'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';

import { toast } from 'react-toastify';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import DataTable, { DataTableColumn } from '@/components/Tables/DataTable';
import AgentServerApi, { ImprovementFilter } from '@/core/client/api/AgentServer';
import type { ImprovementThread } from '@/shared/types/agent';
import { OUTCOME_LABELS, SeverityBadge, StageBadge, formatDateTime, kindLabel } from '../components/agentLabels';

const TABS: { key: ImprovementFilter; label: string }[] = [
  { key: 'reviewing', label: 'Chờ duyệt' },
  { key: 'active', label: 'Đang xử lý' },
  { key: 'closed', label: 'Đã đóng' },
  { key: 'all', label: 'Tất cả' },
];

const REFRESH_MS = 10_000;

// The inbox: improvement threads waiting for a decision (thread status `interrupted`), and the rest by stage.
const Inbox = ({
  initialTab = 'reviewing',
  pageName = 'Hộp duyệt của Agent',
}: {
  initialTab?: ImprovementFilter;
  pageName?: string;
}) => {
  const router = useRouter();
  const [tab, setTab] = useState<ImprovementFilter>(initialTab);
  const [threads, setThreads] = useState<ImprovementThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  // `quiet` refreshes keep the table on screen; returns false when the agent could not be reached.
  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      const result = await AgentServerApi.listImprovements(tab);
      setThreads(result || []);
      setLoading(false);
      return result !== undefined;
    },
    [tab],
  );

  // Threads opened by a detection run (manual or cron) are analysed in the background: refresh so their proposals
  // show up without a reload. Stops after a failed load (the error was reported once).
  useEffect(() => {
    load();
    const timer = setInterval(async () => {
      if (!(await load(true))) clearInterval(timer);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const runNow = async () => {
    setRunning(true);
    if (await AgentServerApi.runMonitorNow()) {
      toast.success('Đã chạy lượt phát hiện.');
      await load();
    }
    setRunning(false);
  };

  const columns: DataTableColumn<ImprovementThread>[] = [
    {
      key: 'title',
      header: 'Vấn đề',
      className: 'min-w-[280px]',
      render: (thread) => (
        <div>
          <p className="font-semibold">{thread.metadata.title || kindLabel(thread.metadata.kind)}</p>
          <p className="text-sm text-body">{thread.values?.opportunity?.summary}</p>
        </div>
      ),
    },
    { key: 'kind', header: 'Loại', render: (thread) => kindLabel(thread.metadata.kind) },
    { key: 'severity', header: 'Mức độ', render: (thread) => <SeverityBadge severity={thread.metadata.severity} /> },
    {
      key: 'stage',
      header: 'Trạng thái',
      render: (thread) => (
        <div className="flex flex-col gap-1">
          <StageBadge stage={thread.status === 'interrupted' ? 'reviewing' : thread.values?.stage} />
          {thread.values?.outcome && <span className="text-xs text-body">{OUTCOME_LABELS[thread.values.outcome]}</span>}
          {thread.status === 'error' && <span className="text-xs text-danger">Lỗi, sẽ thử lại ở lượt sau</span>}
        </div>
      ),
    },
    { key: 'updated_at', header: 'Cập nhật', render: (thread) => formatDateTime(thread.updated_at) },
  ];

  return (
    <>
      <Breadcrumb pageName={pageName} />
      <DataTable
        title={
          <div className="flex flex-wrap gap-2">
            {TABS.map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  tab === item.key ? 'bg-brand text-brand-ink' : 'bg-gray-2 text-body dark:bg-meta-4'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        }
        actions={
          <button
            onClick={runNow}
            disabled={running}
            className="rounded-md bg-brand px-4 py-2 font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-60"
          >
            {running ? 'Đang phát hiện...' : 'Chạy phát hiện ngay'}
          </button>
        }
        columns={columns}
        data={threads}
        rowKey={(thread) => thread.thread_id}
        loading={loading}
        emptyText={tab === 'reviewing' ? 'Không có đề xuất nào chờ duyệt' : 'Không có đề xuất nào'}
        onRowClick={(thread) => router.push(`/admin/agent/threads/${thread.thread_id}`)}
      />
    </>
  );
};

export default Inbox;
