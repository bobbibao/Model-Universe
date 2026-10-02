'use client';

import { useEffect, useState } from 'react';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import AgentMarketingApi from '@/core/client/api/AgentMarketing';
import { formatVND } from '@/shared/server/utils/utils';
import type { GrowthScorecard } from '@/shared/types/agent-marketing';
import { VERDICT_LABELS } from '../components/agentLabels';

const PLATFORM_LABELS: Record<string, string> = { meta: 'Meta', google: 'Google Ads', tiktok: 'TikTok' };

const Tile = ({ label, value, note }: { label: string; value: string; note?: string }) => (
  <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
    <p className="text-sm text-body">{label}</p>
    <p className="mt-1 text-2xl font-semibold text-black dark:text-white">{value}</p>
    {note && <p className="mt-1 text-xs text-body">{note}</p>}
  </div>
);

// The growth agent against the month's goal: revenue and pace, what its campaigns brought and cost, measured
// incremental profit, and ROAS per platform (the same analytics views the agent reads).
const Growth = () => {
  const [card, setCard] = useState<GrowthScorecard | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setCard(await AgentMarketingApi.getScorecard());
      setLoading(false);
    })();
  }, []);

  if (loading) return <p className="text-body">Đang tải...</p>;
  if (!card) return <p className="text-danger">Không tải được bảng kết quả.</p>;
  const behind = card.pace_vnd !== null && card.revenue_vnd < card.pace_vnd;
  const verdicts = Object.entries(card.outcomes)
    .map(([verdict, n]) => `${VERDICT_LABELS[verdict as keyof typeof VERDICT_LABELS] ?? verdict}: ${n}`)
    .join(', ');

  return (
    <>
      <Breadcrumb pageName="Kết quả tăng trưởng" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Tile
          label={`Doanh thu tháng ${card.month.slice(0, 7)}`}
          value={formatVND(card.revenue_vnd)}
          note={
            card.target_vnd === null
              ? 'Chưa có mục tiêu doanh thu.'
              : `Mục tiêu ${formatVND(card.target_vnd)}; theo tiến độ đều cần ${formatVND(card.pace_vnd ?? 0)}` +
                (behind ? ' (đang chậm).' : ' (đúng hoặc vượt tiến độ).')
          }
        />
        <Tile label="Doanh thu từ chiến dịch của tác tử" value={formatVND(card.attributed_revenue_vnd)} />
        <Tile
          label="Lợi nhuận gộp tăng thêm (đã đo)"
          value={formatVND(card.incremental_profit_vnd)}
          note={verdicts || 'Chưa có kết quả đo lường trong tháng.'}
        />
        <Tile
          label="Chi quảng cáo"
          value={formatVND(card.spend_vnd)}
          note={`Hạn mức tháng ${formatVND(card.ad_cap_vnd)}`}
        />
      </div>
      <div className="mt-6 rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
        <h3 className="mb-3 font-semibold text-black dark:text-white">ROAS theo nền tảng</h3>
        {card.roas.length === 0 ? (
          <p className="text-sm text-body">Chưa có quảng cáo nào chạy trong tháng.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-body">
                <th className="py-2">Nền tảng</th>
                <th>Chi tiêu</th>
                <th>Giá trị chuyển đổi</th>
                <th>ROAS</th>
              </tr>
            </thead>
            <tbody>
              {card.roas.map((row) => (
                <tr key={row.platform} className="border-t border-stroke dark:border-strokedark">
                  <td className="py-2">{PLATFORM_LABELS[row.platform] ?? row.platform}</td>
                  <td>{formatVND(row.spend_vnd)}</td>
                  <td>{formatVND(row.conversion_value_vnd)}</td>
                  <td>{row.roas === null ? '—' : row.roas.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
};

export default Growth;
