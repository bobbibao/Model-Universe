'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import DataTable, { DataTableColumn } from '@/components/Tables/DataTable';
import { inputClassName } from '@/components/FormElements/TextField';
import AgentMarketingApi, { AuditParams } from '@/core/client/api/AgentMarketing';
import type { AgentAuditEntry, AgentWriteClass } from '@/shared/types/agent-marketing';
import type { Pagination } from '@/shared/types/pagination';
import { formatDateTime } from '../components/agentLabels';

const PAGE_SIZE = 20;

const WRITE_CLASSES: Record<AgentWriteClass, { label: string; className: string }> = {
  shop_change: { label: 'Thay đổi cửa hàng', className: 'bg-warning/10 text-warning' },
  protective: { label: 'Bảo vệ', className: 'bg-success/10 text-success' },
  ingestion: { label: 'Nạp dữ liệu', className: 'bg-body/10 text-body' },
};

const APPROVAL_LABELS: Record<string, string> = {
  grant: 'Quản trị viên duyệt',
  auto_low: 'Tự động (rủi ro thấp)',
  protective: 'Luôn cho phép',
  ingestion: 'Dữ liệu',
};

// Every write the agent made through the Agent API: what, under which approval (grant or the low-risk autonomy),
// from which thread and option, with its trace id, and whether it was reverted.
const Audit = () => {
  const [entries, setEntries] = useState<AgentAuditEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>();
  const [loading, setLoading] = useState(true);
  const [writeClass, setWriteClass] = useState<AuditParams['writeClass']>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await AgentMarketingApi.getAudit({ writeClass, q: search || undefined, page, per_page: PAGE_SIZE });
    setEntries(result?.data || []);
    setPagination(result?.pagination);
    setLoading(false);
  }, [writeClass, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const columns: DataTableColumn<AgentAuditEntry>[] = [
    { key: 'createdAt', header: 'Thời điểm', render: (entry) => formatDateTime(entry.createdAt) },
    {
      key: 'endpoint',
      header: 'Thao tác',
      className: 'min-w-[260px]',
      render: (entry) => (
        <div>
          <p className="font-mono text-sm font-semibold">{entry.endpoint}</p>
          <p className="text-sm text-body">{entry.responseBody?.detail}</p>
          <p className="font-mono text-xs text-body">{entry.idempotencyKey}</p>
        </div>
      ),
    },
    {
      key: 'writeClass',
      header: 'Loại',
      render: (entry) => {
        const label = entry.writeClass ? WRITE_CLASSES[entry.writeClass] : null;
        return label ? (
          <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${label.className}`}>
            {label.label}
          </span>
        ) : (
          '—'
        );
      },
    },
    {
      key: 'approvalMode',
      header: 'Phê duyệt',
      render: (entry) => (
        <div className="text-sm">
          <p>{entry.approvalMode ? APPROVAL_LABELS[entry.approvalMode] || entry.approvalMode : '—'}</p>
          {entry.approverUserId && <p className="text-body">Quản trị viên #{entry.approverUserId}</p>}
          {entry.riskTier && <p className="text-body">Rủi ro: {entry.riskTier}</p>}
        </div>
      ),
    },
    {
      key: 'threadId',
      header: 'Luồng',
      render: (entry) =>
        entry.threadId ? (
          <Link href={`/admin/agent/threads/${entry.threadId}`} className="font-mono text-xs hover:underline">
            {entry.threadId.slice(0, 8)}
            {entry.optionId ? ` · ${entry.optionId}` : ''}
          </Link>
        ) : (
          '—'
        ),
    },
    {
      key: 'traceId',
      header: 'Trace',
      render: (entry) => <span className="font-mono text-xs">{entry.traceId ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (entry) =>
        entry.status === 'reverted' ? (
          <span className="text-sm text-danger">Đã hoàn tác {formatDateTime(entry.revertedAt)}</span>
        ) : (
          <span className="text-sm text-success">Đã áp dụng</span>
        ),
    },
  ];

  return (
    <>
      <Breadcrumb pageName="Nhật ký tác tử" />
      <DataTable
        title="Các thao tác của tác tử AI"
        actions={
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className={`${inputClassName} !py-2 sm:w-56`}
              placeholder="Tìm theo mã, thao tác, luồng"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <select
              className={`${inputClassName} !py-2 sm:w-48`}
              value={writeClass}
              onChange={(event) => {
                setWriteClass(event.target.value as AuditParams['writeClass']);
                setPage(1);
              }}
            >
              <option value="">Tất cả loại</option>
              <option value="shop_change">Thay đổi cửa hàng</option>
              <option value="protective">Bảo vệ</option>
              <option value="ingestion">Nạp dữ liệu</option>
            </select>
          </div>
        }
        columns={columns}
        data={entries}
        rowKey={(entry) => entry.id}
        loading={loading}
        emptyText="Chưa có thao tác nào"
        pagination={pagination}
        onPageChange={setPage}
      />
    </>
  );
};

export default Audit;
