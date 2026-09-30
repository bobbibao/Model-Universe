'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import BarChart from '@/components/Charts/BarChart';
import { CHART_COLORS } from '@/components/Charts/ChartCard';
import DataTable, { DataTableColumn } from '@/components/Tables/DataTable';
import CiApi from '@/core/client/api/Ci';
import type { CiImpactItem, CiVerdict } from '@/shared/types/ci';
import {
  VERDICT_LABELS,
  formatDateTime,
  formatImprovement,
  formatSignedPercent,
  kpiLabel,
  signalLabel,
  strategyLabel,
} from '../components/ciLabels';

// A single series: the direction from zero carries better/worse; this hue passes the contrast checks on both
// the light and the dark chart surface.
const IMPACT_COLOR = CHART_COLORS[4];

const VERDICT_CLASSES: Record<CiVerdict, string> = {
  success: 'bg-success/10 text-success',
  inconclusive: 'bg-body/10 text-body',
  negative: 'bg-danger/10 text-danger',
};

const StatTile = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-sm border border-stroke bg-white px-6 py-5 shadow-default dark:border-strokedark dark:bg-boxdark">
    <p className="text-title-md font-bold text-black dark:text-white">{value}</p>
    <p className="text-sm font-medium text-body">{label}</p>
  </div>
);

// Mean improvement % per KPI over every measured improvement (positive = better for that KPI).
const averageByKpi = (items: CiImpactItem[]) => {
  const totals = new Map<string, { sum: number; count: number }>();
  items.forEach((item) =>
    item.deltas.forEach((delta) => {
      const total = totals.get(delta.name) || { sum: 0, count: 0 };
      totals.set(delta.name, { sum: total.sum + delta.improvementPct, count: total.count + 1 });
    }),
  );
  return Array.from(totals, ([name, { sum, count }]) => ({ name, value: Math.round((sum / count) * 10) / 10 }));
};

// Before/after KPI results of improvements the agent carried out and measured.
const KpiImpact = () => {
  const router = useRouter();
  const [items, setItems] = useState<CiImpactItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    CiApi.getImpact().then((result) => {
      setItems(result || []);
      setLoading(false);
    });
  }, []);

  const averages = useMemo(() => averageByKpi(items), [items]);
  const countOf = (verdict: CiVerdict) => items.filter((item) => item.verdict === verdict).length;

  const columns: DataTableColumn<CiImpactItem>[] = [
    {
      key: 'signal',
      header: 'Vấn đề',
      className: 'min-w-[240px]',
      render: (item) => (
        <div>
          <p className="font-semibold">{signalLabel(item.signalKind)}</p>
          <p className="text-sm text-body">{item.signalSummary}</p>
        </div>
      ),
    },
    {
      key: 'strategy',
      header: 'Chiến lược',
      render: (item) => (
        <span>
          {item.strategy ? strategyLabel(item.strategy) : '—'}
          {item.autoApproved && <span className="block text-xs text-body">Tự động duyệt (rủi ro thấp)</span>}
        </span>
      ),
    },
    {
      key: 'verdict',
      header: 'Kết quả',
      render: (item) => (
        <span
          className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${VERDICT_CLASSES[item.verdict]}`}
        >
          {VERDICT_LABELS[item.verdict] || item.verdict}
        </span>
      ),
    },
    {
      key: 'deltas',
      header: 'Thay đổi chỉ số',
      className: 'min-w-[220px]',
      render: (item) => (
        <ul className="text-sm">
          {item.deltas.map((delta) => (
            <li key={delta.name}>
              {kpiLabel(delta.name)}: <span className="font-medium">{formatImprovement(delta.improvementPct)}</span>
            </li>
          ))}
        </ul>
      ),
    },
    { key: 'measuredAt', header: 'Đo lúc', render: (item) => formatDateTime(item.measuredAt) },
  ];

  return (
    <>
      <Breadcrumb pageName="Hiệu quả cải tiến" />
      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile label="Đề xuất đã đo lường" value={items.length} />
        <StatTile label={VERDICT_LABELS.success} value={countOf('success')} />
        <StatTile label={VERDICT_LABELS.inconclusive} value={countOf('inconclusive')} />
        <StatTile label={VERDICT_LABELS.negative} value={countOf('negative')} />
      </div>
      <div className="mb-6">
        <BarChart
          title="Mức cải thiện trung bình theo chỉ số"
          subtitle="So với trước khi thực hiện. Dương là tốt hơn, âm là xấu hơn (đã tính chiều tốt của từng chỉ số)."
          categories={averages.map((item) => kpiLabel(item.name))}
          seriesName="Cải thiện trung bình"
          values={averages.map((item) => item.value)}
          horizontal
          color={IMPACT_COLOR}
          loading={loading}
          formatValue={formatSignedPercent}
          height={Math.max(200, averages.length * 70)}
          showValues
        />
      </div>
      <DataTable
        title="Chi tiết từng đề xuất"
        columns={columns}
        data={items}
        rowKey={(item) => item.improvementId}
        loading={loading}
        emptyText="Chưa có đề xuất nào được đo lường"
        onRowClick={(item) => router.push(`/admin/ci/improvements/${encodeURIComponent(item.improvementId)}`)}
      />
    </>
  );
};

export default KpiImpact;
