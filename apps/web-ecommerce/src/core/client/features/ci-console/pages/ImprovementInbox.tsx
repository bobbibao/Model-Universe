'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import DataTable, { DataTableColumn } from '@/components/Tables/DataTable';
import CiApi from '@/core/client/api/Ci';
import type { CiImprovementGroup, CiImprovementSummary } from '@/shared/types/ci';
import { CiStatusBadge, SeverityBadge, formatDateTime, signalLabel } from '../components/ciLabels';
import NotificationPanel from '../components/NotificationPanel';
import RunStatusBar from '../components/RunStatusBar';

const TABS: { value: CiImprovementGroup | ''; label: string }[] = [
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'active', label: 'Đang xử lý' },
  { value: 'closed', label: 'Đã đóng' },
  { value: '', label: 'Tất cả' },
];

// Proposal inbox: improvements from the CI agent, the ones waiting for a human decision first.
const ImprovementInbox = () => {
  const router = useRouter();
  const [group, setGroup] = useState<CiImprovementGroup | ''>('pending');
  const [items, setItems] = useState<CiImprovementSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [running, setRunning] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false); // a run in progress, e.g. a scheduled one

  const load = useCallback(async () => {
    setLoading(true);
    const result = await CiApi.getImprovements(group);
    setLoadFailed(result === undefined); // the AI service did not answer: not the same as "no proposals"
    setItems(result || []);
    setLoading(false);
  }, [group]);

  useEffect(() => {
    load();
  }, [load]);

  const runNow = async () => {
    setRunning(true);
    if (await CiApi.runNow()) await load();
    setRunning(false);
  };

  const columns: DataTableColumn<CiImprovementSummary>[] = [
    {
      key: 'summary',
      header: 'Vấn đề',
      className: 'min-w-[280px]',
      render: (item) => (
        <div>
          <p className="font-semibold">{signalLabel(item.signalKind)}</p>
          <p className="text-sm text-body">{item.summary}</p>
        </div>
      ),
    },
    { key: 'severity', header: 'Mức độ', render: (item) => <SeverityBadge severity={item.severity} /> },
    { key: 'status', header: 'Trạng thái', render: (item) => <CiStatusBadge status={item.status} /> },
    { key: 'options', header: 'Phương án', render: (item) => item.options.length || '—' },
    { key: 'updatedAt', header: 'Cập nhật', render: (item) => formatDateTime(item.updatedAt) },
  ];

  return (
    <>
      <Breadcrumb pageName="Đề xuất cải tiến" />
      <RunStatusBar onRunFinished={load} onRunningChange={setAgentRunning} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        <div className="xl:col-span-3">
          <DataTable
            title={
              <div className="flex flex-wrap gap-2">
                {TABS.map((tab) => (
                  <button
                    key={tab.value || 'all'}
                    onClick={() => setGroup(tab.value)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                      group === tab.value
                        ? 'bg-brand text-brand-ink'
                        : 'text-body hover:text-brand-hover dark:text-bodydark'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            }
            actions={
              <button
                onClick={runNow}
                disabled={running || agentRunning}
                className="rounded-md bg-brand px-4 py-2 font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-60"
              >
                {running || agentRunning ? 'Đang chạy...' : 'Chạy phát hiện ngay'}
              </button>
            }
            columns={columns}
            data={items}
            rowKey={(item) => item.id}
            loading={loading}
            emptyText={
              loadFailed
                ? 'Chưa tải được danh sách: dịch vụ AI tạm thời không trả lời. Vui lòng thử lại sau.'
                : group === 'pending'
                  ? 'Không có đề xuất nào đang chờ duyệt'
                  : 'Không có đề xuất nào'
            }
            onRowClick={(item) => router.push(`/admin/ci/improvements/${encodeURIComponent(item.id)}`)}
          />
        </div>
        <NotificationPanel />
      </div>
    </>
  );
};

export default ImprovementInbox;
