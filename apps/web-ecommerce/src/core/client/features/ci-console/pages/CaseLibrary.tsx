'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import DataTable, { DataTableColumn } from '@/components/Tables/DataTable';
import { inputClassName } from '@/components/FormElements/TextField';
import CiApi from '@/core/client/api/Ci';
import type { CiCase, CiCaseOutcome } from '@/shared/types/ci';
import {
  OUTCOME_LABELS,
  SIGNAL_KIND_LABELS,
  VERDICT_LABELS,
  formatDateTime,
  formatImprovement,
  kpiLabel,
  signalLabel,
  strategyLabel,
} from '../components/ciLabels';

const OUTCOME_CLASSES: Record<CiCaseOutcome, string> = {
  approved: 'bg-success/10 text-success',
  failed: 'bg-danger/10 text-danger',
  rejected: 'bg-warning/10 text-warning',
  expired: 'bg-body/10 text-body',
  dismissed: 'bg-body/10 text-body',
};

// Institutional memory of the agent: every closed improvement, including rejections, expirations and
// failures, with the lessons it drew. Past cases bias how the agent ranks options next time.
const CaseLibrary = () => {
  const router = useRouter();
  const [cases, setCases] = useState<CiCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState('');
  const [outcome, setOutcome] = useState<CiCaseOutcome | ''>('');

  useEffect(() => {
    setLoading(true);
    CiApi.getCases({ kind, outcome }).then((result) => {
      setCases(result || []);
      setLoading(false);
    });
  }, [kind, outcome]);

  const columns: DataTableColumn<CiCase>[] = [
    { key: 'createdAt', header: 'Thời gian', render: (item) => formatDateTime(item.createdAt) },
    {
      key: 'situation',
      header: 'Tình huống',
      className: 'min-w-[260px]',
      render: (item) => (
        <div>
          <p className="font-semibold">{signalLabel(item.signalKind)}</p>
          <p className="line-clamp-3 text-sm text-body">{item.situation}</p>
        </div>
      ),
    },
    {
      key: 'outcome',
      header: 'Quyết định',
      render: (item) => (
        <div>
          <span
            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${OUTCOME_CLASSES[item.outcome]}`}
          >
            {OUTCOME_LABELS[item.outcome]}
          </span>
          {item.strategy && <p className="mt-1 text-sm text-body">Chiến lược: {strategyLabel(item.strategy)}</p>}
        </div>
      ),
    },
    {
      key: 'result',
      header: 'Kết quả',
      className: 'min-w-[180px]',
      render: (item) =>
        item.outcomeVerdict ? (
          <div className="text-sm">
            <p className="font-medium">{VERDICT_LABELS[item.outcomeVerdict] || item.outcomeVerdict}</p>
            {item.kpiSummary.map((kpi) => (
              <p key={kpi.name} className="text-body">
                {kpiLabel(kpi.name)}: {formatImprovement(Number(kpi.value))}
              </p>
            ))}
          </div>
        ) : (
          <span className="text-body">—</span>
        ),
    },
    {
      key: 'lessons',
      header: 'Bài học',
      className: 'min-w-[260px]',
      render: (item) =>
        item.lessons.length ? (
          <ul className="list-disc pl-4 text-sm">
            {item.lessons.map((lesson) => (
              <li key={lesson}>{lesson}</li>
            ))}
          </ul>
        ) : (
          <span className="text-body">—</span>
        ),
    },
  ];

  return (
    <>
      <Breadcrumb pageName="Thư viện tình huống" />
      <DataTable
        title="Các tình huống đã xử lý"
        actions={
          <>
            <select
              className={`${inputClassName} !py-2 sm:w-48`}
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="">Tất cả loại vấn đề</option>
              {Object.entries(SIGNAL_KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              className={`${inputClassName} !py-2 sm:w-52`}
              value={outcome}
              onChange={(event) => setOutcome(event.target.value as CiCaseOutcome | '')}
            >
              <option value="">Tất cả quyết định</option>
              {(Object.keys(OUTCOME_LABELS) as CiCaseOutcome[]).map((value) => (
                <option key={value} value={value}>
                  {OUTCOME_LABELS[value]}
                </option>
              ))}
            </select>
          </>
        }
        columns={columns}
        data={cases}
        rowKey={(item) => item.id}
        loading={loading}
        emptyText="Chưa có tình huống nào"
        onRowClick={(item) => router.push(`/admin/ci/improvements/${encodeURIComponent(item.improvementId)}`)}
      />
    </>
  );
};

export default CaseLibrary;
