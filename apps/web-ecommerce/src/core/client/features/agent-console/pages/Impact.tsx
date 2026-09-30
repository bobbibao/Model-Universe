'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import DataTable, { DataTableColumn } from '@/components/Tables/DataTable';
import AgentServerApi from '@/core/client/api/AgentServer';
import type { ImprovementThread } from '@/shared/types/agent';
import { VERDICT_LABELS, formatDateTime, kindLabel } from '../components/agentLabels';

// Measured improvements: the verdict and the KPI change against the baseline taken right before acting.
const Impact = () => {
  const [threads, setThreads] = useState<ImprovementThread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const closed = (await AgentServerApi.listImprovements('closed')) || [];
      setThreads(closed.filter((thread) => thread.values?.measurement));
      setLoading(false);
    })();
  }, []);

  const columns: DataTableColumn<ImprovementThread>[] = [
    {
      key: 'title',
      header: 'Vấn đề',
      className: 'min-w-[240px]',
      render: (thread) => (
        <Link href={`/admin/agent/threads/${thread.thread_id}`} className="font-semibold hover:underline">
          {thread.metadata.title || kindLabel(thread.metadata.kind)}
        </Link>
      ),
    },
    {
      key: 'strategy',
      header: 'Phương án',
      render: (thread) =>
        thread.values?.options?.find((option) => option.option_id === thread.values?.decision?.option_id)?.title ?? '—',
    },
    {
      key: 'verdict',
      header: 'Đánh giá',
      render: (thread) => VERDICT_LABELS[thread.values!.measurement!.verdict],
    },
    { key: 'summary', header: 'Thay đổi KPI', render: (thread) => thread.values?.measurement?.summary },
    {
      key: 'measured_at',
      header: 'Đo lúc',
      render: (thread) => formatDateTime(thread.values?.measurement?.measured_at),
    },
  ];

  return (
    <>
      <Breadcrumb pageName="Hiệu quả cải tiến" />
      <DataTable
        title="Các cải tiến đã đo lường"
        columns={columns}
        data={threads}
        rowKey={(thread) => thread.thread_id}
        loading={loading}
        emptyText="Chưa có cải tiến nào được đo lường"
      />
    </>
  );
};

export default Impact;
